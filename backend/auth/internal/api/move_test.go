package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
)

func moveAs(t *testing.T, h *Handler, roles []string, memberID, branchID string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	req := authedRequest(t, h, http.MethodPut, "/auth/admin/users/"+memberID+"/branch",
		"caller", "caller@example.org", roles, map[string]string{"branchId": branchID})
	req.SetPathValue("id", memberID)
	h.adminMoveUser(rec, req)
	return rec
}

func branchOf(t *testing.T, h *Handler, id string) string {
	t.Helper()
	u, err := h.users.FindByID(id)
	if err != nil || u == nil {
		t.Fatalf("find %s: %v", id, err)
	}
	return u.BranchID
}

func TestMove_FederationAdminMovesWithinTheirFederation(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedOrganization(t, h)
	seedUser(t, h, &store.User{ID: "k1", Email: "k1@example.org", BranchID: "karlstad", Language: "sv"})

	rec := moveAs(t, h, []string{authz.FederationAdmin("SE")}, "k1", "goteborg")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	if got := branchOf(t, h, "k1"); got != "goteborg" {
		t.Errorf("branch = %q, want goteborg", got)
	}

	var resp movedUserResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil || !resp.Notified {
		t.Errorf("response = %s, want notified", rec.Body.String())
	}
	if sender.movedTo != "k1@example.org" || sender.movedLang != "sv" {
		t.Errorf("mail went to %q in %q, want the member in their own language", sender.movedTo, sender.movedLang)
	}
	if sender.movedFrom != "Karlstad" || sender.movedDest != "Göteborg" {
		t.Errorf("mail named %q → %q, want both branches by name", sender.movedFrom, sender.movedDest)
	}
}

// Each end must be covered on its own. A federation admin can neither send a
// member out of their federation nor reach into another one to fetch one.
func TestMove_FederationAdminStaysInsideTheirFederation(t *testing.T) {
	cases := []struct {
		name, member, destination string
	}{
		{"out to another federation", "k1", "oslo"},
		{"out to a branch directly under WSKO", "k1", "tokyo"},
		{"in from another federation", "o1", "karlstad"},
		{"in from nowhere", "nobody", "karlstad"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			sender := &fakeSender{}
			h := newTestHandler(t, sender)
			seedOrganization(t, h)
			before := branchOf(t, h, c.member)

			rec := moveAs(t, h, []string{authz.FederationAdmin("SE")}, c.member, c.destination)
			if rec.Code != http.StatusNotFound {
				t.Fatalf("status = %d, want 404", rec.Code)
			}
			if got := branchOf(t, h, c.member); got != before {
				t.Errorf("branch = %q, want it left at %q", got, before)
			}
			if sender.movedTo != "" {
				t.Errorf("mailed %q about a move that did not happen", sender.movedTo)
			}
		})
	}
}

// A branch admin covers one branch, and a move needs two.
func TestMove_BranchAdminCannotMove(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	if rec := moveAs(t, h, []string{authz.BranchAdmin("karlstad")}, "k1", "goteborg"); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if got := branchOf(t, h, "k1"); got != "karlstad" {
		t.Errorf("branch = %q, want karlstad", got)
	}
}

func TestMove_WSKOAndGlobalAdminsMoveAnywhere(t *testing.T) {
	for _, role := range []string{authz.RoleWSKOAdmin, authz.RoleAdmin} {
		t.Run(role, func(t *testing.T) {
			sender := &fakeSender{}
			h := newTestHandler(t, sender)
			seedOrganization(t, h)

			if rec := moveAs(t, h, []string{role}, "o1", "tokyo"); rec.Code != http.StatusOK {
				t.Fatalf("across federations: status = %d, want 200", rec.Code)
			}
			if got := branchOf(t, h, "o1"); got != "tokyo" {
				t.Errorf("branch = %q, want tokyo", got)
			}

			// Somebody who belonged to no branch at all is given one, and the
			// mail has no old club to name.
			if rec := moveAs(t, h, []string{role}, "nobody", "karlstad"); rec.Code != http.StatusOK {
				t.Fatalf("from no branch: status = %d, want 200", rec.Code)
			}
			if sender.movedFrom != "" || sender.movedDest != "Karlstad" {
				t.Errorf("mail named %q → %q, want no old branch", sender.movedFrom, sender.movedDest)
			}
		})
	}
}

func TestMove_RejectsUnknownAndCurrentBranch(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedOrganization(t, h)
	admin := []string{authz.RoleAdmin}

	if rec := moveAs(t, h, admin, "k1", "atlantis"); rec.Code != http.StatusNotFound {
		t.Errorf("unknown branch: status = %d, want 404", rec.Code)
	}
	if rec := moveAs(t, h, admin, "k1", ""); rec.Code != http.StatusNotFound {
		t.Errorf("no branch: status = %d, want 404", rec.Code)
	}
	if rec := moveAs(t, h, admin, "k1", "karlstad"); rec.Code != http.StatusConflict {
		t.Errorf("same branch: status = %d, want 409", rec.Code)
	}
	if rec := moveAs(t, h, admin, "ghost", "karlstad"); rec.Code != http.StatusNotFound {
		t.Errorf("unknown member: status = %d, want 404", rec.Code)
	}
	if sender.movedTo != "" {
		t.Errorf("mailed %q about a move that did not happen", sender.movedTo)
	}
}

// A pending transfer to the branch the member has just been put in has been
// answered; one to somewhere else is still theirs to have answered.
func TestMove_SettlesOnlyAMatchingPendingTransfer(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	for _, tr := range []*store.TransferRequest{
		{ID: "k1", FromBranchID: "karlstad", ToBranchID: "goteborg", Status: store.TransferPending},
		{ID: "k2", FromBranchID: "karlstad", ToBranchID: "oslo", Status: store.TransferPending},
	} {
		if err := h.transfers.Save(tr); err != nil {
			t.Fatalf("seed transfer %s: %v", tr.ID, err)
		}
	}
	admin := []string{authz.RoleAdmin}

	if rec := moveAs(t, h, admin, "k1", "goteborg"); rec.Code != http.StatusOK {
		t.Fatalf("move k1: status = %d", rec.Code)
	}
	if rec := moveAs(t, h, admin, "k2", "goteborg"); rec.Code != http.StatusOK {
		t.Fatalf("move k2: status = %d", rec.Code)
	}

	if got, _ := h.transfers.Get("k1"); got != nil {
		t.Errorf("k1's transfer to goteborg = %+v, want it settled by the move", got)
	}
	if got, _ := h.transfers.Get("k2"); !got.IsPending() {
		t.Errorf("k2's transfer to oslo = %+v, want it still pending", got)
	}
}

// A mail that fails does not undo the move, and the admin hears that the
// member was not told.
func TestMove_ReportsAFailedNotification(t *testing.T) {
	sender := &fakeSender{movedErr: errors.New("relay down")}
	h := newTestHandler(t, sender)
	seedOrganization(t, h)

	rec := moveAs(t, h, []string{authz.RoleAdmin}, "k1", "goteborg")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var resp movedUserResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil || resp.Notified {
		t.Errorf("response = %s, want notified false", rec.Body.String())
	}
	if got := branchOf(t, h, "k1"); got != "goteborg" {
		t.Errorf("branch = %q, want goteborg despite the mail failing", got)
	}
}

// Both clubs hear about it, each in its admins' own language: the one losing a
// member, told an administrator did it, and the one gaining a member it never
// decided to take.
func TestMove_TellsTheAdminsOfBothBranches(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedOrganization(t, h)
	for addr, roles := range map[string][]string{
		"k-admin@example.org": {authz.BranchAdmin("karlstad")},
		"g-admin@example.org": {authz.BranchAdmin("goteborg")},
	} {
		if err := h.roles.SetRoles(addr, roles); err != nil {
			t.Fatalf("seed roles: %v", err)
		}
	}
	seedUser(t, h, &store.User{ID: "ka", Email: "k-admin@example.org", BranchID: "karlstad", Language: "sv"})
	seedUser(t, h, &store.User{ID: "ga", Email: "g-admin@example.org", BranchID: "goteborg", Language: "ja"})
	seedUser(t, h, &store.User{ID: "k1", Email: "k1@example.org", DisplayName: "Ann Ask", BranchID: "karlstad"})

	if rec := moveAs(t, h, []string{authz.FederationAdmin("SE")}, "k1", "goteborg"); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	if len(sender.departures) != 1 {
		t.Fatalf("sent %d departure notices, want 1", len(sender.departures))
	}
	departure := sender.departures[0]
	if len(departure.to) != 1 || departure.to[0] != "k-admin@example.org" || departure.lang != "sv" {
		t.Errorf("departure went to %v in %q, want the old branch's admin in theirs", departure.to, departure.lang)
	}
	if !departure.notice.ByAdmin || departure.notice.FromBranchName != "Karlstad" || departure.notice.ToBranchName != "Göteborg" {
		t.Errorf("departure = %+v, want both branches and that an admin did it", departure.notice)
	}

	if len(sender.arrivals) != 1 {
		t.Fatalf("sent %d arrival notices, want 1", len(sender.arrivals))
	}
	arrival := sender.arrivals[0]
	if len(arrival.to) != 1 || arrival.to[0] != "g-admin@example.org" || arrival.lang != "ja" {
		t.Errorf("arrival went to %v in %q, want the new branch's admin in theirs", arrival.to, arrival.lang)
	}
	if arrival.notice.MemberName != "Ann Ask" || arrival.notice.FromBranchName != "Karlstad" {
		t.Errorf("arrival = %+v, want the member and where they came from", arrival.notice)
	}
}

// The admin who made the move, and the member if they administer a branch
// themselves, already know — they are not told again as somebody else.
func TestMove_DoesNotTellThoseWhoAlreadyKnow(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedOrganization(t, h)
	// The caller administers both branches; the member administers the one
	// they are leaving.
	if err := h.roles.SetRoles("caller@example.org", []string{authz.BranchAdmin("karlstad"), authz.BranchAdmin("goteborg")}); err != nil {
		t.Fatalf("seed roles: %v", err)
	}
	if err := h.roles.SetRoles("k1@example.org", []string{authz.BranchAdmin("karlstad")}); err != nil {
		t.Fatalf("seed roles: %v", err)
	}

	rec := moveAs(t, h, []string{authz.BranchAdmin("karlstad"), authz.BranchAdmin("goteborg")}, "k1", "goteborg")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	for _, d := range sender.departures {
		t.Errorf("departure notice sent to %v, want nobody", d.to)
	}
	for _, a := range sender.arrivals {
		t.Errorf("arrival notice sent to %v, want nobody", a.to)
	}
	if sender.movedTo != "k1@example.org" {
		t.Errorf("member's own mail went to %q, want it sent regardless", sender.movedTo)
	}
}

// Somebody who belonged nowhere leaves no club behind to tell.
func TestMove_FromNoBranchTellsOnlyTheNewOne(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedOrganization(t, h)
	if err := h.roles.SetRoles("g-admin@example.org", []string{authz.BranchAdmin("goteborg")}); err != nil {
		t.Fatalf("seed roles: %v", err)
	}

	if rec := moveAs(t, h, []string{authz.RoleAdmin}, "nobody", "goteborg"); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if len(sender.departures) != 0 {
		t.Errorf("sent %d departure notices, want none", len(sender.departures))
	}
	if len(sender.arrivals) != 1 || sender.arrivals[0].notice.FromBranchName != "" {
		t.Errorf("arrivals = %+v, want one naming no old branch", sender.arrivals)
	}
}

// A branch with no admin of its own has nobody to tell. The news does not climb
// to the federation or WSKO the way a request waiting on an answer does.
func TestMove_DoesNotEscalatePastTheBranch(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedOrganization(t, h)
	for addr, roles := range map[string][]string{
		"se-admin@example.org":   {authz.FederationAdmin("SE")},
		"wsko-admin@example.org": {authz.RoleWSKOAdmin},
		"root@example.org":       {authz.RoleAdmin},
	} {
		if err := h.roles.SetRoles(addr, roles); err != nil {
			t.Fatalf("seed roles: %v", err)
		}
	}

	if rec := moveAs(t, h, []string{authz.RoleAdmin}, "k1", "goteborg"); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	for _, d := range sender.departures {
		t.Errorf("departure notice sent to %v, want nobody", d.to)
	}
	for _, a := range sender.arrivals {
		t.Errorf("arrival notice sent to %v, want nobody", a.to)
	}
	if sender.movedTo != "k1@example.org" {
		t.Errorf("member's own mail went to %q, want it sent regardless", sender.movedTo)
	}
}
