package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
)

// historyOf returns everything recorded so far, keyed by type.
func historyOf(t *testing.T, h *Handler) map[string][]*store.HistoryEntry {
	t.Helper()
	all, err := h.history.Since("")
	if err != nil {
		t.Fatalf("read history: %v", err)
	}
	out := map[string][]*store.HistoryEntry{}
	for _, e := range all {
		out[e.Type] = append(out[e.Type], e)
	}
	return out
}

// The promise the container rests on: nothing in it points at a person. Every
// test below runs its entries past this.
func assertAnonymous(t *testing.T, e *store.HistoryEntry, people ...string) {
	t.Helper()
	data, _ := json.Marshal(e)
	for _, p := range people {
		if strings.Contains(string(data), p) {
			t.Errorf("history entry names %q: %s", p, data)
		}
	}
}

func TestHistory_ApplicationsAndTheAccountsTheyBecome(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	ticket := ticketFor(t, h, "hopeful@example.org", "Hopeful Person")
	if rec := applyAs(t, h, ticket, map[string]string{"branchId": "karlstad", "name": "Hopeful Person"}); rec.Code != http.StatusNoContent {
		t.Fatalf("apply: %d", rec.Code)
	}
	if code := decide(t, h, "/auth/admin/requests/hopeful@example.org/approve", "hopeful@example.org", []string{authz.RoleAdmin}, true); code != http.StatusNoContent {
		t.Fatalf("approve: %d", code)
	}

	got := historyOf(t, h)
	outcomes := map[string]bool{}
	for _, e := range got[store.HistoryApplication] {
		outcomes[e.Outcome] = true
		if e.Branch != "karlstad" {
			t.Errorf("application entry in branch %q", e.Branch)
		}
		assertAnonymous(t, e, "hopeful", "Hopeful")
	}
	if !outcomes[store.ApplicationSubmitted] || !outcomes[store.ApplicationApproved] {
		t.Errorf("application outcomes = %v, want submitted and approved", outcomes)
	}

	created := got[store.HistoryAccountCreated]
	if len(created) != 1 || created[0].Branch != "karlstad" || created[0].Via != store.ViaApplied {
		t.Fatalf("account_created = %+v", created)
	}
	user, _ := h.users.FindByLinkedIdentity(emailProviderName, "hopeful@example.org")
	assertAnonymous(t, created[0], "hopeful", user.ID)
}

func TestHistory_ADeclinedApplication(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	ticket := ticketFor(t, h, "turned-away@example.org", "Turned Away")
	applyAs(t, h, ticket, map[string]string{"branchId": "goteborg", "name": "Turned Away"})
	decide(t, h, "/auth/admin/requests/turned-away@example.org/deny", "turned-away@example.org", []string{authz.RoleAdmin}, false)

	declined := false
	for _, e := range historyOf(t, h)[store.HistoryApplication] {
		declined = declined || (e.Outcome == store.ApplicationDeclined && e.Branch == "goteborg")
	}
	if !declined {
		t.Error("no declined application recorded")
	}
	if created := historyOf(t, h)[store.HistoryAccountCreated]; len(created) != 0 {
		t.Errorf("a declined applicant produced an account: %+v", created)
	}
}

func TestHistory_AMoveByAnAdmin(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	if rec := moveAs(t, h, []string{authz.RoleAdmin}, "k1", "goteborg"); rec.Code != http.StatusOK {
		t.Fatalf("move: %d", rec.Code)
	}
	moves := historyOf(t, h)[store.HistoryTransfer]
	if len(moves) != 1 || moves[0].From != "karlstad" || moves[0].To != "goteborg" || moves[0].Via != store.ViaAdmin {
		t.Fatalf("transfer = %+v", moves)
	}
	assertAnonymous(t, moves[0], "k1@example.org", `"k1"`)
}

func TestHistory_DeletingAnAccountRecordsWhereAndRoughlyHowLong(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	seedUser(t, h, &store.User{ID: "leaver", Email: "leaver@example.org", BranchID: "oslo",
		CreatedAt: time.Now().AddDate(0, -3, 0).UTC().Format(time.RFC3339)})

	rec := httptest.NewRecorder()
	h.deleteAccount(rec, authedRequest(t, h, http.MethodDelete, "/auth/account", "leaver", "leaver@example.org", nil, nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: %d", rec.Code)
	}

	deleted := historyOf(t, h)[store.HistoryAccountDeleted]
	if len(deleted) != 1 || deleted[0].Branch != "oslo" || deleted[0].Lifetime != "1-6m" {
		t.Fatalf("account_deleted = %+v", deleted)
	}
	assertAnonymous(t, deleted[0], "leaver")
}

// Staging: history follows usage statistics, and with it switched off nothing is
// written and nothing breaks.
func TestHistory_SwitchedOffRecordsNothing(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	h.history = nil

	if rec := moveAs(t, h, []string{authz.RoleAdmin}, "k1", "goteborg"); rec.Code != http.StatusOK {
		t.Fatalf("move with history off: %d", rec.Code)
	}
	if rec := usageHistoryAs(t, h, []string{authz.RoleAdmin}, ""); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("history endpoint with history off: %d, want 503", rec.Code)
	}
}

func TestLifetimeBucket(t *testing.T) {
	now := time.Date(2026, 10, 24, 0, 0, 0, 0, time.UTC)
	for ago, want := range map[time.Duration]string{
		24 * time.Hour:        "<1m",
		90 * 24 * time.Hour:   "1-6m",
		200 * 24 * time.Hour:  "6-12m",
		400 * 24 * time.Hour:  "1-2y",
		1000 * 24 * time.Hour: "2y+",
	} {
		if got := lifetimeBucket(now.Add(-ago).Format(time.RFC3339), now); got != want {
			t.Errorf("%v ago: %s, want %s", ago, got, want)
		}
	}
	if got := lifetimeBucket("", now); got != "unknown" {
		t.Errorf("no creation date: %s", got)
	}
}

func usageHistoryAs(t *testing.T, h *Handler, roles []string, query string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.adminUsageHistory(rec, authedRequest(t, h, http.MethodGet, "/auth/admin/usage/history"+query, "caller", "caller@example.org", roles, nil))
	return rec
}

func TestAdminUsageHistory_TechnicalAdminOnly(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	for _, roles := range [][]string{{authz.RoleWSKOAdmin}, {authz.FederationAdmin("SE")}, nil} {
		if rec := usageHistoryAs(t, h, roles, ""); rec.Code != http.StatusForbidden {
			t.Errorf("%v: %d, want 403", roles, rec.Code)
		}
	}
}

func TestAdminUsageHistory_PagesByWhenEntriesWereRecorded(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	admin := []string{authz.RoleAdmin}

	h.record(store.HistoryEntry{Type: store.HistoryAccountCreated, Branch: "karlstad", Via: store.ViaAdmin})
	var first struct {
		Items    []*store.HistoryEntry `json:"items"`
		Branches []publicBranch        `json:"branches"`
	}
	rec := usageHistoryAs(t, h, admin, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	json.NewDecoder(rec.Body).Decode(&first)
	if len(first.Items) != 1 || len(first.Branches) != 4 {
		t.Fatalf("first page: %d items, %d branches", len(first.Items), len(first.Branches))
	}
	cursor := first.Items[0].RecordedAt

	time.Sleep(2 * time.Millisecond)
	h.record(store.HistoryEntry{Type: store.HistoryAccountDeleted, Branch: "oslo", Lifetime: "<1m"})

	var next struct {
		Items []*store.HistoryEntry `json:"items"`
	}
	json.NewDecoder(usageHistoryAs(t, h, admin, "?since="+cursor).Body).Decode(&next)
	// Inclusive, so the entry at the cursor comes back too; the page drops what it
	// already has by id.
	if len(next.Items) != 2 {
		t.Errorf("since the first entry: %d items, want both", len(next.Items))
	}

	// A cursor without fractional seconds still finds everything in its second.
	whole, _ := time.Parse(store.RecordedAtFormat, cursor)
	rec = usageHistoryAs(t, h, admin, "?since="+whole.Truncate(time.Second).Format(time.RFC3339))
	json.NewDecoder(rec.Body).Decode(&next)
	if len(next.Items) != 2 {
		t.Errorf("since the whole second: %d items, want both", len(next.Items))
	}

	if rec := usageHistoryAs(t, h, admin, "?since=yesterday"); rec.Code != http.StatusBadRequest {
		t.Errorf("a cursor that is not a time: %d, want 400", rec.Code)
	}
}
