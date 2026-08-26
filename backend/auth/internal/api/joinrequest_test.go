package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/token"
)

// ticketFor mints the proof-of-address a would-be member arrives with.
func ticketFor(t *testing.T, h *Handler, email, name string) string {
	t.Helper()
	signed, err := h.tokens.IssueJoinTicket(token.JoinTicket{
		Provider: emailProviderName, Sub: email, Email: email, Name: name,
	})
	if err != nil {
		t.Fatalf("issue join ticket: %v", err)
	}
	return signed
}

func applyAs(t *testing.T, h *Handler, ticket string, body any) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/auth/join/request", strings.NewReader(string(b)))
	req.AddCookie(&http.Cookie{Name: joinCookieName, Value: ticket})
	rec := httptest.NewRecorder()
	h.joinRequest(rec, req)
	return rec
}

func TestJoinRequest_RecordsAndNotifies(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedOrganization(t, h)
	if err := h.roles.SetRoles("karlstad-admin@example.org", []string{authz.BranchAdmin("karlstad")}); err != nil {
		t.Fatalf("seed roles: %v", err)
	}

	ticket := ticketFor(t, h, "hopeful@example.org", "Hopeful Person")
	rec := applyAs(t, h, ticket, map[string]string{
		"branchId": "karlstad", "name": "Hopeful Person",
		"note": "I train on Tuesdays with Anders", "language": "sv",
	})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}

	stored, err := h.joinRequests.Get("hopeful@example.org")
	if err != nil || stored == nil {
		t.Fatalf("request not stored: %v", err)
	}
	if !stored.IsPending() || stored.BranchID != "karlstad" || stored.Note == "" {
		t.Errorf("stored request = %+v", stored)
	}
	// The identity that proved the address rides along, so approval links the
	// account to it rather than to anything typed afterwards.
	if stored.Provider != emailProviderName || stored.Sub != "hopeful@example.org" {
		t.Errorf("stored identity = %s/%s", stored.Provider, stored.Sub)
	}
	// An applicant is not a user until somebody says so.
	if u, _ := h.users.FindByLinkedIdentity(emailProviderName, "hopeful@example.org"); u != nil {
		t.Errorf("applying created a user: %+v", u)
	}

	// The branch's own admin is told, and the applicant is told that they were.
	if len(sender.noticeTo) != 1 || sender.noticeTo[0] != "karlstad-admin@example.org" {
		t.Errorf("notice went to %v, want the branch admin", sender.noticeTo)
	}
	if sender.notice.Note != "I train on Tuesdays with Anders" {
		t.Errorf("notice note = %q", sender.notice.Note)
	}
	if sender.receivedTo != "hopeful@example.org" || sender.receivedLang != "sv" {
		t.Errorf("acknowledgement = %q (%q)", sender.receivedTo, sender.receivedLang)
	}

	// The ticket bought exactly one request.
	var cleared bool
	for _, c := range rec.Result().Cookies() {
		if c.Name == joinCookieName && c.MaxAge < 0 {
			cleared = true
		}
	}
	if !cleared {
		t.Error("the join ticket was not cleared after being spent")
	}
}

// Notifying branch admins alone would mean almost every request arriving
// nowhere on the day this ships, since only one branch has an admin.
func TestJoinRequestRecipients_FallsBackUpTheTree(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	seed := func(email string, roles ...string) {
		if err := h.roles.SetRoles(email, roles); err != nil {
			t.Fatalf("seed %s: %v", email, err)
		}
	}
	seed("global@example.org", authz.RoleAdmin)
	seed("swede@example.org", authz.FederationAdmin("SE"))
	seed("local@example.org", authz.BranchAdmin("karlstad"))

	got := func(branch string) []string {
		to, err := h.joinRequestRecipients(branch)
		if err != nil {
			t.Fatalf("recipients for %s: %v", branch, err)
		}
		return to
	}

	// A branch with its own admin: only they are told.
	if to := got("karlstad"); len(to) != 1 || to[0] != "local@example.org" {
		t.Errorf("karlstad → %v, want the branch admin alone", to)
	}
	// A branch without one falls to the federation.
	if to := got("goteborg"); len(to) != 1 || to[0] != "swede@example.org" {
		t.Errorf("goteborg → %v, want the federation admin", to)
	}
	// A branch in a federation with no admin either falls all the way to global.
	if to := got("oslo"); len(to) != 1 || to[0] != "global@example.org" {
		t.Errorf("oslo → %v, want the global admin", to)
	}
	// And a branch belonging to no federation skips the middle tier entirely.
	if to := got("tokyo"); len(to) != 1 || to[0] != "global@example.org" {
		t.Errorf("tokyo → %v, want the global admin", to)
	}
}

func TestJoinRequest_RefusesWhatItShould(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	ticket := ticketFor(t, h, "hopeful@example.org", "Hopeful Person")

	if rec := applyAs(t, h, ticket, map[string]string{"branchId": "atlantis", "name": "X"}); rec.Code != http.StatusBadRequest {
		t.Errorf("unknown branch: %d, want 400", rec.Code)
	}
	// A blank name falls back to the one the provider gave, so it is only an
	// error when there is nothing to fall back to — an emailed code carries no
	// display name of its own.
	if rec := applyAs(t, h, ticket, map[string]string{"branchId": "karlstad", "name": "  "}); rec.Code != http.StatusNoContent {
		t.Errorf("blank name with a name on the ticket: %d, want 204", rec.Code)
	}
	nameless := ticketFor(t, h, "nameless@example.org", "")
	if rec := applyAs(t, h, nameless, map[string]string{"branchId": "karlstad", "name": "  "}); rec.Code != http.StatusBadRequest {
		t.Errorf("blank name with nothing to fall back to: %d, want 400", rec.Code)
	}
	long := strings.Repeat("ö", maxNoteLength+1)
	if rec := applyAs(t, h, ticket, map[string]string{"branchId": "karlstad", "name": "X", "note": long}); rec.Code != http.StatusBadRequest {
		t.Errorf("overlong note: %d, want 400", rec.Code)
	}

	// Without a ticket there is nothing to go on.
	rec := httptest.NewRecorder()
	h.joinRequest(rec, httptest.NewRequest(http.MethodPost, "/auth/join/request", strings.NewReader("{}")))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("no ticket: %d, want 401", rec.Code)
	}

	// An address that already has an account is not an applicant; the remedy is
	// to sign in, which they can already do.
	seedUser(t, h, &store.User{
		ID: "u1", Email: "member@example.org",
		LinkedIdentities: map[string]store.LinkedIdentity{
			emailProviderName: {Sub: "member@example.org", Email: "member@example.org"},
		},
	})
	member := ticketFor(t, h, "member@example.org", "Member")
	if rec := applyAs(t, h, member, map[string]string{"branchId": "karlstad", "name": "Member"}); rec.Code != http.StatusConflict {
		t.Errorf("existing account: %d, want 409", rec.Code)
	}
}

func TestJoinRequest_SecondApplicationWhilePending(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	ticket := ticketFor(t, h, "hopeful@example.org", "Hopeful Person")

	if rec := applyAs(t, h, ticket, map[string]string{"branchId": "karlstad", "name": "Hopeful"}); rec.Code != http.StatusNoContent {
		t.Fatalf("first application: %d", rec.Code)
	}
	rec := applyAs(t, h, ticket, map[string]string{"branchId": "goteborg", "name": "Hopeful"})
	if rec.Code != http.StatusConflict {
		t.Fatalf("second application: %d, want 409", rec.Code)
	}
	var body map[string]string
	json.Unmarshal(rec.Body.Bytes(), &body)
	if body["reason"] != "pending" {
		t.Errorf("reason = %q, want pending", body["reason"])
	}
	// And the first request is untouched by the attempt.
	if stored, _ := h.joinRequests.Get("hopeful@example.org"); stored == nil || stored.BranchID != "karlstad" {
		t.Errorf("the pending request changed: %+v", stored)
	}
}

func decide(t *testing.T, h *Handler, path, email string, roles []string, approve bool) int {
	t.Helper()
	req := authedRequest(t, h, http.MethodPost, path, "admin", "admin@example.org", roles, nil)
	req.SetPathValue("email", email)
	rec := httptest.NewRecorder()
	if approve {
		h.adminApproveRequest(rec, req)
	} else {
		h.adminDenyRequest(rec, req)
	}
	return rec.Code
}

func TestJoinRequest_ApprovalMakesTheUser(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedOrganization(t, h)
	ticket := ticketFor(t, h, "hopeful@example.org", "Hopeful Person")
	applyAs(t, h, ticket, map[string]string{
		"branchId": "karlstad", "name": "Hopeful Person", "language": "sv",
	})

	if code := decide(t, h, "/auth/admin/requests/hopeful@example.org/approve",
		"hopeful@example.org", []string{authz.BranchAdmin("karlstad")}, true); code != http.StatusNoContent {
		t.Fatalf("approve: %d, want 204", code)
	}

	user, err := h.users.FindByLinkedIdentity(emailProviderName, "hopeful@example.org")
	if err != nil || user == nil {
		t.Fatalf("no user after approval: %v", err)
	}
	if user.BranchID != "karlstad" || user.DisplayName != "Hopeful Person" {
		t.Errorf("user = %+v", user)
	}
	// The request is gone: the account supersedes it, so nothing of the
	// applicant's is left behind.
	if stored, _ := h.joinRequests.Get("hopeful@example.org"); stored != nil {
		t.Errorf("request survived approval: %+v", stored)
	}
	if !sender.decided || !sender.approved || sender.decisionTo != "hopeful@example.org" {
		t.Errorf("decision mail = to %q approved=%t sent=%t", sender.decisionTo, sender.approved, sender.decided)
	}
	if sender.decisionLang != "sv" {
		t.Errorf("decision language = %q, want the one they applied in", sender.decisionLang)
	}
}

func TestJoinRequest_DenialIsRememberedThenForgotten(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedOrganization(t, h)
	if err := h.roles.SetRoles("karlstad-admin@example.org", []string{authz.BranchAdmin("karlstad")}); err != nil {
		t.Fatalf("seed roles: %v", err)
	}
	ticket := ticketFor(t, h, "hopeful@example.org", "Hopeful Person")
	applyAs(t, h, ticket, map[string]string{"branchId": "karlstad", "name": "Hopeful Person"})

	if code := decide(t, h, "/auth/admin/requests/hopeful@example.org/deny",
		"hopeful@example.org", []string{authz.BranchAdmin("karlstad")}, false); code != http.StatusNoContent {
		t.Fatalf("deny: %d, want 204", code)
	}
	if !sender.decided || sender.approved {
		t.Error("no denial mail sent")
	}

	stored, _ := h.joinRequests.Get("hopeful@example.org")
	if stored == nil || stored.Status != store.JoinDenied {
		t.Fatalf("denied request = %+v", stored)
	}
	// Kept, but not forever: it is somebody's name and address held on somebody
	// who is not a user.
	if stored.TTL != store.DeniedRequestTTL {
		t.Errorf("ttl = %d, want %d", stored.TTL, store.DeniedRequestTTL)
	}
	if stored.DecidedAt == "" || stored.DecidedBy != "admin" {
		t.Errorf("decision not recorded: %+v", stored)
	}
	// No user was created, and no account exists to sign in with.
	if u, _ := h.users.FindByLinkedIdentity(emailProviderName, "hopeful@example.org"); u != nil {
		t.Errorf("denial created a user: %+v", u)
	}

	// Re-applying is allowed — an admin may have clicked the wrong thing — and
	// the next one to look is told it is not the first time.
	again := applyAs(t, h, ticketFor(t, h, "hopeful@example.org", "Hopeful Person"),
		map[string]string{"branchId": "karlstad", "name": "Hopeful Person"})
	if again.Code != http.StatusNoContent {
		t.Fatalf("re-application: %d, want 204", again.Code)
	}
	reapplied, _ := h.joinRequests.Get("hopeful@example.org")
	if reapplied == nil || !reapplied.IsPending() {
		t.Fatalf("re-application did not reopen the request: %+v", reapplied)
	}
	if reapplied.PreviouslyDeniedAt != stored.DecidedAt {
		t.Errorf("previouslyDeniedAt = %q, want the earlier decision's timestamp", reapplied.PreviouslyDeniedAt)
	}
	if reapplied.TTL != 0 {
		t.Errorf("a pending request carries a ttl of %d; it should never expire", reapplied.TTL)
	}
	if sender.notice.PreviouslyDeniedAt == "" {
		t.Error("the notice did not mention the earlier refusal")
	}
}

func TestJoinRequest_DecidingIsScoped(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	applyAs(t, h, ticketFor(t, h, "hopeful@example.org", "Hopeful"),
		map[string]string{"branchId": "karlstad", "name": "Hopeful"})

	// An admin of another branch cannot see it, so cannot decide it — and is
	// told it does not exist rather than that it is not theirs.
	for _, approve := range []bool{true, false} {
		if code := decide(t, h, "/auth/admin/requests/hopeful@example.org/x",
			"hopeful@example.org", []string{authz.BranchAdmin("oslo")}, approve); code != http.StatusNotFound {
			t.Errorf("outsider deciding (approve=%t): %d, want 404", approve, code)
		}
	}
	if stored, _ := h.joinRequests.Get("hopeful@example.org"); stored == nil || !stored.IsPending() {
		t.Error("an outsider changed the request")
	}

	// The listing is scoped the same way.
	list := func(roles []string) []adminRequest {
		rec := httptest.NewRecorder()
		h.adminListRequests(rec, authedRequest(t, h, http.MethodGet, "/auth/admin/requests",
			"caller", "caller@example.org", roles, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("list: %d", rec.Code)
		}
		var out []adminRequest
		json.Unmarshal(rec.Body.Bytes(), &out)
		return out
	}
	if got := list([]string{authz.BranchAdmin("oslo")}); len(got) != 0 {
		t.Errorf("an outsider saw %d requests", len(got))
	}
	got := list([]string{authz.BranchAdmin("karlstad")})
	if len(got) != 1 || got[0].Email != "hopeful@example.org" {
		t.Fatalf("the branch admin saw %+v", got)
	}
	if got[0].BranchName != "Karlstad" {
		t.Errorf("branch name = %q, want it resolved for the reader", got[0].BranchName)
	}
	// A federation admin above the branch sees it too.
	if got := list([]string{authz.FederationAdmin("SE")}); len(got) != 1 {
		t.Errorf("the federation admin saw %d requests, want 1", len(got))
	}
}

func TestJoinWithdraw(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	ticket := ticketFor(t, h, "hopeful@example.org", "Hopeful")
	applyAs(t, h, ticket, map[string]string{"branchId": "karlstad", "name": "Hopeful"})

	withdraw := func(ticket string) int {
		req := httptest.NewRequest(http.MethodPost, "/auth/join/withdraw", nil)
		if ticket != "" {
			req.AddCookie(&http.Cookie{Name: joinCookieName, Value: ticket})
		}
		rec := httptest.NewRecorder()
		h.joinWithdraw(rec, req)
		return rec.Code
	}

	if code := withdraw(""); code != http.StatusUnauthorized {
		t.Errorf("no ticket: %d, want 401", code)
	}
	if code := withdraw(ticket); code != http.StatusNoContent {
		t.Fatalf("withdraw: %d, want 204", code)
	}
	// Nothing of theirs is held afterwards, which is how erasure is answered
	// without a request path of its own.
	if stored, _ := h.joinRequests.Get("hopeful@example.org"); stored != nil {
		t.Errorf("request survived withdrawal: %+v", stored)
	}
	if code := withdraw(ticket); code != http.StatusNotFound {
		t.Errorf("withdrawing twice: %d, want 404", code)
	}
}

// The registration screen reads its state from the ticket, so a returning
// applicant lands on their pending request rather than on an empty form.
func TestJoinContext_ReportsAPendingRequest(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	ticket := ticketFor(t, h, "hopeful@example.org", "Hopeful")

	context := func() map[string]any {
		req := httptest.NewRequest(http.MethodGet, "/auth/join/context", nil)
		req.AddCookie(&http.Cookie{Name: joinCookieName, Value: ticket})
		rec := httptest.NewRecorder()
		h.joinContext(rec, req)
		var out map[string]any
		json.Unmarshal(rec.Body.Bytes(), &out)
		return out
	}

	if _, pending := context()["pending"]; pending {
		t.Error("nothing has been applied for yet")
	}
	applyAs(t, h, ticket, map[string]string{"branchId": "karlstad", "name": "Hopeful"})

	pending, ok := context()["pending"].(map[string]any)
	if !ok {
		t.Fatal("the pending request is not reported")
	}
	if pending["branchId"] != "karlstad" || pending["branchName"] != "Karlstad" {
		t.Errorf("pending = %v", pending)
	}
}
