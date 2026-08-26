package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
)

// askToTransfer is a member asking for themselves, which is the whole shape of
// the feature: no handshake with the club they are leaving.
func askToTransfer(t *testing.T, h *Handler, userID, email string, body any) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.requestTransfer(rec, authedRequest(t, h, http.MethodPost, "/auth/transfer", userID, email, nil, body))
	return rec
}

func decideTransfer(t *testing.T, h *Handler, action, memberID string, roles []string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	req := authedRequest(t, h, http.MethodPost, "/auth/admin/transfers/"+memberID+"/"+action,
		"caller", "caller@example.org", roles, nil)
	req.SetPathValue("id", memberID)
	if action == "accept" {
		h.adminAcceptTransfer(rec, req)
	} else {
		h.adminRejectTransfer(rec, req)
	}
	return rec
}

func TestTransfer_AcceptedMovesTheMemberAndTellsBothClubs(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedOrganization(t, h)
	// k1 is in Karlstad and wants to move to Göteborg. Each club has an admin,
	// and they do not read the same language.
	if err := h.roles.SetRoles("g-admin@example.org", []string{authz.BranchAdmin("goteborg")}); err != nil {
		t.Fatalf("seed roles: %v", err)
	}
	if err := h.roles.SetRoles("k-admin@example.org", []string{authz.BranchAdmin("karlstad")}); err != nil {
		t.Fatalf("seed roles: %v", err)
	}
	seedUser(t, h, &store.User{ID: "ga", Email: "g-admin@example.org", BranchID: "goteborg", Language: "ja"})
	seedUser(t, h, &store.User{ID: "ka", Email: "k-admin@example.org", BranchID: "karlstad", Language: "sv"})

	if rec := askToTransfer(t, h, "k1", "k1@example.org", map[string]string{
		"toBranchId": "goteborg", "note": "Jag har flyttat",
	}); rec.Code != http.StatusNoContent {
		t.Fatalf("ask: status = %d, want 204", rec.Code)
	}

	// Only the receiving branch is asked. The club being left has nothing to
	// decide and is not consulted.
	if len(sender.transferNotices) != 1 {
		t.Fatalf("sent %d notices, want 1", len(sender.transferNotices))
	}
	notice := sender.transferNotices[0]
	if len(notice.to) != 1 || notice.to[0] != "g-admin@example.org" {
		t.Errorf("notice went to %v, want the receiving branch's admin", notice.to)
	}
	if notice.lang != "ja" {
		t.Errorf("notice language = %q, want the recipient's own", notice.lang)
	}
	if notice.notice.FromBranchName != "Karlstad" || notice.notice.ToBranchName != "Göteborg" {
		t.Errorf("notice = %+v, want both branches named", notice.notice)
	}

	if rec := decideTransfer(t, h, "accept", "k1", []string{authz.BranchAdmin("goteborg")}); rec.Code != http.StatusNoContent {
		t.Fatalf("accept: status = %d, want 204", rec.Code)
	}

	member, _ := h.users.FindByID("k1")
	if member.BranchID != "goteborg" {
		t.Errorf("member branch = %q, want goteborg", member.BranchID)
	}
	// Accepted transfers are not kept: the member's branch is the record of it.
	if left, _ := h.transfers.Get("k1"); left != nil {
		t.Errorf("accepted transfer still stored: %+v", left)
	}

	if !sender.transferDecided || !sender.transferAccepted || sender.transferDecisionTo != "k1@example.org" {
		t.Errorf("member was not told: decided=%v accepted=%v to=%q",
			sender.transferDecided, sender.transferAccepted, sender.transferDecisionTo)
	}
	// The club they left is told rather than asked — and in its own language.
	if len(sender.departures) != 1 {
		t.Fatalf("sent %d departure notices, want 1", len(sender.departures))
	}
	departure := sender.departures[0]
	if len(departure.to) != 1 || departure.to[0] != "k-admin@example.org" || departure.lang != "sv" {
		t.Errorf("departure notice went to %v (%s)", departure.to, departure.lang)
	}
}

func TestTransfer_RefusedIsRememberedThenCarriedIntoTheNextAsk(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedOrganization(t, h)
	if err := h.roles.SetRoles("g-admin@example.org", []string{authz.BranchAdmin("goteborg")}); err != nil {
		t.Fatalf("seed roles: %v", err)
	}

	askToTransfer(t, h, "k1", "k1@example.org", map[string]string{"toBranchId": "goteborg"})
	if rec := decideTransfer(t, h, "reject", "k1", []string{authz.BranchAdmin("goteborg")}); rec.Code != http.StatusNoContent {
		t.Fatalf("reject: status = %d, want 204", rec.Code)
	}

	member, _ := h.users.FindByID("k1")
	if member.BranchID != "karlstad" {
		t.Errorf("a refused member moved anyway: branch = %q", member.BranchID)
	}
	refused, _ := h.transfers.Get("k1")
	if refused == nil || refused.Status != store.TransferRejected || refused.DecidedAt == "" {
		t.Fatalf("refusal not recorded: %+v", refused)
	}
	// Kept, but not forever: it is the record of somebody being told no.
	if refused.TTL != store.RejectedTransferTTL {
		t.Errorf("ttl = %d, want %d", refused.TTL, store.RejectedTransferTTL)
	}
	if !sender.transferDecided || sender.transferAccepted {
		t.Errorf("member was not told of the refusal")
	}

	// Asking again is allowed, and arrives with its history so the next admin is
	// not judging blind.
	if rec := askToTransfer(t, h, "k1", "k1@example.org", map[string]string{"toBranchId": "goteborg"}); rec.Code != http.StatusNoContent {
		t.Fatalf("second ask: status = %d, want 204", rec.Code)
	}
	again, _ := h.transfers.Get("k1")
	if !again.IsPending() || again.PreviouslyRejectedAt != refused.DecidedAt {
		t.Errorf("second request = %+v, want pending and carrying the refusal date", again)
	}
	latest := sender.transferNotices[len(sender.transferNotices)-1]
	if latest.notice.PreviouslyRejectedAt == "" {
		t.Errorf("the notice did not mention that this member has been refused before")
	}
}

func TestTransfer_RefusesWhatItShould(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	// A branch that does not exist.
	if rec := askToTransfer(t, h, "k1", "k1@example.org", map[string]string{"toBranchId": "atlantis"}); rec.Code != http.StatusBadRequest {
		t.Errorf("unknown branch: status = %d, want 400", rec.Code)
	}
	// The one they are already in: there is nothing for anybody to decide.
	if rec := askToTransfer(t, h, "k1", "k1@example.org", map[string]string{"toBranchId": "karlstad"}); rec.Code != http.StatusConflict {
		t.Errorf("own branch: status = %d, want 409", rec.Code)
	}
	// One at a time — two clubs deciding the same member's future independently
	// is a race nobody asked for.
	askToTransfer(t, h, "k1", "k1@example.org", map[string]string{"toBranchId": "goteborg"})
	rec := askToTransfer(t, h, "k1", "k1@example.org", map[string]string{"toBranchId": "oslo"})
	if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "pending") {
		t.Errorf("second pending request: status = %d, body = %q", rec.Code, rec.Body.String())
	}

	// Anonymous callers have no transfer to ask about.
	anon := httptest.NewRecorder()
	h.requestTransfer(anon, httptest.NewRequest(http.MethodPost, "/auth/transfer", strings.NewReader("{}")))
	if anon.Code != http.StatusUnauthorized {
		t.Errorf("unauthenticated: status = %d, want 401", anon.Code)
	}
}

// Deciding is the receiving branch's to do. The club being left has no say, and
// neither has anybody else — a transfer the caller may not decide is reported as
// missing rather than refused, so a 403 cannot be used to find out who is trying
// to leave.
func TestTransfer_DecidingIsScoped(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	askToTransfer(t, h, "k1", "k1@example.org", map[string]string{"toBranchId": "goteborg"})

	for _, roles := range [][]string{
		{authz.BranchAdmin("karlstad")}, // the branch being left
		{authz.BranchAdmin("oslo")},     // a bystander
		{authz.FederationAdmin("NO")},   // the wrong federation
	} {
		if rec := decideTransfer(t, h, "accept", "k1", roles); rec.Code != http.StatusNotFound {
			t.Errorf("accept as %v: status = %d, want 404", roles, rec.Code)
		}
	}

	// The federation above the receiving branch covers it, and so may decide.
	if rec := decideTransfer(t, h, "accept", "k1", []string{authz.FederationAdmin("SE")}); rec.Code != http.StatusNoContent {
		t.Errorf("accept as the federation: status = %d, want 204", rec.Code)
	}
}

func TestTransfer_MemberSeesAndCanWithdrawTheirOwn(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	get := func() *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		h.myTransfer(rec, authedRequest(t, h, http.MethodGet, "/auth/transfer", "k1", "k1@example.org", nil, nil))
		return rec
	}

	if rec := get(); rec.Code != http.StatusNoContent {
		t.Fatalf("with no request: status = %d, want 204", rec.Code)
	}

	askToTransfer(t, h, "k1", "k1@example.org", map[string]string{"toBranchId": "goteborg", "note": "flyttat"})
	rec := get()
	if rec.Code != http.StatusOK {
		t.Fatalf("with a request: status = %d, want 200", rec.Code)
	}
	var view transferView
	if err := json.Unmarshal(rec.Body.Bytes(), &view); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// The destination is named, not just identified: the member picked a name
	// from a list and should read their own request back in those terms.
	if view.ToBranchName != "Göteborg" || view.Status != store.TransferPending || view.Note != "flyttat" {
		t.Errorf("view = %+v", view)
	}

	withdraw := httptest.NewRecorder()
	h.withdrawTransfer(withdraw, authedRequest(t, h, http.MethodDelete, "/auth/transfer", "k1", "k1@example.org", nil, nil))
	if withdraw.Code != http.StatusNoContent {
		t.Fatalf("withdraw: status = %d, want 204", withdraw.Code)
	}
	if left, _ := h.transfers.Get("k1"); left != nil {
		t.Errorf("withdrawn transfer still stored: %+v", left)
	}
}

func TestAdminListTransfers_ScopedToTheReceivingBranch(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	askToTransfer(t, h, "k1", "k1@example.org", map[string]string{"toBranchId": "goteborg"})
	askToTransfer(t, h, "o1", "o1@example.org", map[string]string{"toBranchId": "karlstad"})

	list := func(roles []string) []adminTransfer {
		rec := httptest.NewRecorder()
		h.adminListTransfers(rec, authedRequest(t, h, http.MethodGet, "/auth/admin/transfers",
			"caller", "caller@example.org", roles, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("list as %v: status = %d", roles, rec.Code)
		}
		var got []adminTransfer
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatalf("decode: %v", err)
		}
		return got
	}

	// Karlstad's admin sees the one coming in, and not the one going out — the
	// branch being left has nothing to decide, so offering it a queue would only
	// invite them to try.
	incoming := list([]string{authz.BranchAdmin("karlstad")})
	if len(incoming) != 1 || incoming[0].ID != "o1" {
		t.Fatalf("karlstad sees %+v, want only the transfer into it", incoming)
	}
	if incoming[0].MemberEmail != "o1@example.org" || incoming[0].FromBranchName != "Oslo" {
		t.Errorf("listed transfer = %+v, want the member named and placed", incoming[0])
	}

	if all := list([]string{authz.RoleWSKOAdmin}); len(all) != 2 {
		t.Errorf("wsko admin sees %d transfers, want both", len(all))
	}
}
