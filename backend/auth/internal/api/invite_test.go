package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
)

// addMember posts one manual addition as the given roles, and hands back the raw
// response so a test can read either the created user or the refusal.
func addMember(t *testing.T, h *Handler, roles []string, body any) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.adminCreateUser(rec, authedRequest(t, h, http.MethodPost, "/auth/admin/users",
		"caller", "caller@example.org", roles, body))
	return rec
}

func TestAdminCreateUser_CreatesTheAccountAndTellsThePerson(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedOrganization(t, h)

	rec := addMember(t, h, []string{authz.BranchAdmin("karlstad")}, map[string]string{
		"email": "Nina@Example.org", "name": "Nina Nilsson", "branchId": "karlstad", "language": "sv",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", rec.Code, rec.Body.String())
	}

	var created createdUserResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !created.Notified {
		t.Error("the response says the person was not told, but the send succeeded")
	}
	if created.DisplayName != "Nina Nilsson" || created.BranchID != "karlstad" {
		t.Errorf("created = %+v", created.User)
	}
	// Nothing owns this name but the admin who typed it, so the admin pages must
	// offer to correct it.
	if created.OIDC {
		t.Error("a manually created account was reported as provider-owned")
	}

	// The account is reachable by the address it is waiting for, which is what
	// makes the first sign-in a point read rather than a scan.
	waiting, err := h.invitedAccount("nina@example.org")
	if err != nil || waiting == nil {
		t.Fatalf("invited account not found: %v", err)
	}
	if waiting.ID != created.ID {
		t.Errorf("invite index points at %s, want %s", waiting.ID, created.ID)
	}

	// Told, in the club's name and the admin's language — the only guess going.
	if sender.createdTo != "Nina@Example.org" || sender.createdBranch != "Karlstad" || sender.createdLang != "sv" {
		t.Errorf("notice = %q, branch %q, lang %q", sender.createdTo, sender.createdBranch, sender.createdLang)
	}
}

// The account exists whether or not the message about it does, so the admin who
// made it is told which of those happened. They are the only one who can pick up
// the phone instead.
func TestAdminCreateUser_ReportsAnUndeliveredNotice(t *testing.T) {
	sender := &fakeSender{createdErr: http.ErrHandlerTimeout}
	h := newTestHandler(t, sender)
	seedOrganization(t, h)

	rec := addMember(t, h, []string{authz.RoleAdmin}, map[string]string{
		"email": "quiet@example.org", "name": "Quiet Person", "branchId": "karlstad",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201 — a relay being down does not un-create the account", rec.Code)
	}
	var created createdUserResponse
	json.Unmarshal(rec.Body.Bytes(), &created)
	if created.Notified {
		t.Error("the send failed but the response claims the person was told")
	}
	if u, _ := h.invitedAccount("quiet@example.org"); u == nil {
		t.Error("the account was not written")
	}
}

// Adding somebody is authority over the branch they are being added to, which is
// the same question every other admin endpoint asks — and a branch outside it
// answers as one that does not exist.
func TestAdminCreateUser_ScopedToTheBranchItTouches(t *testing.T) {
	for _, tc := range []struct {
		name   string
		roles  []string
		branch string
		want   int
	}{
		{"a branch admin may add to their own branch", []string{authz.BranchAdmin("karlstad")}, "karlstad", http.StatusCreated},
		{"but not to the club next door", []string{authz.BranchAdmin("karlstad")}, "goteborg", http.StatusNotFound},
		{"a federation admin may add anywhere in their federation", []string{authz.FederationAdmin("SE")}, "goteborg", http.StatusCreated},
		{"and not outside it", []string{authz.FederationAdmin("SE")}, "oslo", http.StatusNotFound},
		{"a WSKO admin may add to a branch hanging off the root", []string{authz.RoleWSKOAdmin}, "tokyo", http.StatusCreated},
		{"a branch that does not exist reads the same as one you cannot see", []string{authz.RoleAdmin}, "atlantis", http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := newTestHandler(t, &fakeSender{})
			seedOrganization(t, h)
			rec := addMember(t, h, tc.roles, map[string]string{
				"email": "newcomer@example.org", "name": "Newcomer", "branchId": tc.branch,
			})
			if rec.Code != tc.want {
				t.Errorf("status = %d, want %d: %s", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

// A second account for one person splits their notes and their grade across two
// logins that both work, so an address already in use is refused however the
// account holding it was made.
func TestAdminCreateUser_RefusesAnAddressThatAlreadyHasAnAccount(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	// One account whose own address is the one being typed, and one where only
	// the provider's copy of it matches — a Google sub is not an address, so the
	// linked identity is the only place that second one is visible.
	seedUser(t, h, &store.User{ID: "existing", Email: "taken@example.org", BranchID: "karlstad"})
	seedUser(t, h, &store.User{
		ID: "viagoogle", Email: "other@example.org", BranchID: "goteborg",
		LinkedIdentities: map[string]store.LinkedIdentity{
			"google": {Sub: "1234", Email: "signedin@example.org"},
		},
	})

	for _, addr := range []string{"taken@example.org", "TAKEN@example.org", "signedin@example.org"} {
		rec := addMember(t, h, []string{authz.RoleAdmin}, map[string]string{
			"email": addr, "name": "Someone", "branchId": "karlstad",
		})
		if rec.Code != http.StatusConflict {
			t.Errorf("%s: status = %d, want 409", addr, rec.Code)
		}
		var body map[string]string
		json.Unmarshal(rec.Body.Bytes(), &body)
		if body["reason"] != "account_exists" {
			t.Errorf("%s: reason = %q", addr, body["reason"])
		}
	}
}

func TestAdminCreateUser_RefusesWhatItCannotStore(t *testing.T) {
	for _, tc := range []struct {
		name string
		body map[string]string
		want string
	}{
		{"an address that is not one", map[string]string{"email": "not-an-address", "name": "X", "branchId": "karlstad"}, "invalid_email"},
		{"a nameless member", map[string]string{"email": "x@example.org", "name": "  ", "branchId": "karlstad"}, "name_required"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := newTestHandler(t, &fakeSender{})
			seedOrganization(t, h)
			rec := addMember(t, h, []string{authz.RoleAdmin}, tc.body)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", rec.Code)
			}
			var body map[string]string
			json.Unmarshal(rec.Body.Bytes(), &body)
			if body["error"] != tc.want {
				t.Errorf("error = %q, want %q", body["error"], tc.want)
			}
		})
	}
}

// A display name is stored, not a header: "Anna <anna@example.org>" parses, and
// what is kept is the address alone — anything else would be an account no login
// could ever find.
func TestAdminCreateUser_StoresTheBareAddress(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	rec := addMember(t, h, []string{authz.RoleAdmin}, map[string]string{
		"email": "Anna Andersson <anna@example.org>", "name": "Anna", "branchId": "karlstad",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", rec.Code, rec.Body.String())
	}
	var created createdUserResponse
	json.Unmarshal(rec.Body.Bytes(), &created)
	if created.Email != "anna@example.org" {
		t.Errorf("stored email = %q", created.Email)
	}
}

// Being added supersedes having applied. Left behind, the application would sit
// in the queue until approved — and approving it creates rather than looks up, so
// the same person would end up with two accounts.
func TestAdminCreateUser_SupersedesAPendingApplication(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	if err := h.joinRequests.Save(&store.JoinRequest{
		ID: "keen@example.org", Email: "keen@example.org", Name: "Keen Person",
		BranchID: "karlstad", Provider: emailProviderName, Sub: "keen@example.org",
		Status: store.JoinPending, CreatedAt: "2026-09-01T00:00:00Z",
	}); err != nil {
		t.Fatalf("seed request: %v", err)
	}

	rec := addMember(t, h, []string{authz.RoleAdmin}, map[string]string{
		"email": "keen@example.org", "name": "Keen Person", "branchId": "karlstad",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", rec.Code, rec.Body.String())
	}
	if left, err := h.joinRequests.Get("keen@example.org"); err != nil || left != nil {
		t.Errorf("the superseded application is still in the queue: %+v (%v)", left, err)
	}
}

// The account waits for the address it names, and the first proof of that address
// claims it. Until then nobody is signed in; afterwards it is an ordinary account
// with an ordinary identity, and the placeholder is gone.
func TestInvitedAccount_ClaimedByTheFirstSignIn(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedOrganization(t, h)

	rec := addMember(t, h, []string{authz.RoleAdmin}, map[string]string{
		"email": "added@example.org", "name": "Added Person", "branchId": "karlstad",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create status = %d: %s", rec.Code, rec.Body.String())
	}
	var created createdUserResponse
	json.Unmarshal(rec.Body.Bytes(), &created)

	// They already have a name, so the sign-in screen must not ask for one.
	start := postJSON(t, h.emailStart, "/auth/email/start", map[string]string{"email": "added@example.org"})
	var startBody map[string]any
	json.Unmarshal(start.Body.Bytes(), &startBody)
	if startBody["action"] != "existing" {
		t.Errorf("action = %v, want existing — an account an admin made is not a new one", startBody["action"])
	}

	verify := postJSON(t, h.emailVerify, "/auth/email/verify", map[string]string{
		"email": "added@example.org", "code": sender.code,
	})
	if verify.Code != http.StatusNoContent {
		t.Fatalf("verify status = %d, want 204: %s", verify.Code, verify.Body.String())
	}
	var gotSession bool
	for _, c := range verify.Result().Cookies() {
		if c.Name == accessCookieName && c.Value != "" {
			gotSession = true
		}
		if c.Name == joinCookieName && c.Value != "" {
			t.Error("an account was waiting, but the sign-in handed out a join ticket")
		}
	}
	if !gotSession {
		t.Error("no session was issued for a claimed account")
	}

	// The same account, not a second one, and no placeholder left on it.
	claimed, err := h.users.FindByLinkedIdentity(emailProviderName, "added@example.org")
	if err != nil || claimed == nil {
		t.Fatalf("claimed account not found: %v", err)
	}
	if claimed.ID != created.ID {
		t.Errorf("signing in created a second account: %s, want %s", claimed.ID, created.ID)
	}
	if _, still := claimed.LinkedIdentities[inviteProviderName]; still {
		t.Error("the placeholder identity survived the claim")
	}
	if claimed.DisplayName != "Added Person" || claimed.BranchID != "karlstad" {
		t.Errorf("the claim lost what the admin set: %+v", claimed)
	}
	if left, err := h.invitedAccount("added@example.org"); err != nil || left != nil {
		t.Error("the account is still listed as waiting to be claimed")
	}
}
