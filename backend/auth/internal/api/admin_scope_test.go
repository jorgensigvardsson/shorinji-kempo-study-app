package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
)

// A small organization to authorize against: two Swedish branches, one
// Norwegian, one hanging straight off WSKO, and a member of each — plus a user
// with no branch at all, who belongs to nobody.
func seedOrganization(t *testing.T, h *Handler) {
	t.Helper()
	nodes := []*store.OrgNode{
		{ID: "SE", Type: store.NodeFederation, Name: "Svenska Shorinji Kempoförbundet"},
		{ID: "NO", Type: store.NodeFederation, Name: "Norges Shorinji Kempo Forbund"},
		{ID: "karlstad", Type: store.NodeBranch, Name: "Karlstad", FederationID: "SE"},
		{ID: "goteborg", Type: store.NodeBranch, Name: "Göteborg", FederationID: "SE"},
		{ID: "oslo", Type: store.NodeBranch, Name: "Oslo", FederationID: "NO"},
		{ID: "tokyo", Type: store.NodeBranch, Name: "Tokyo"},
	}
	for _, n := range nodes {
		if err := h.orgs.Save(n); err != nil {
			t.Fatalf("seed org %s: %v", n.ID, err)
		}
	}
	users := []*store.User{
		{ID: "k1", Email: "k1@example.org", BranchID: "karlstad"},
		{ID: "k2", Email: "k2@example.org", BranchID: "karlstad"},
		{ID: "g1", Email: "g1@example.org", BranchID: "goteborg"},
		{ID: "o1", Email: "o1@example.org", BranchID: "oslo"},
		{ID: "t1", Email: "t1@example.org", BranchID: "tokyo"},
		{ID: "nobody", Email: "nobody@example.org"},
	}
	for _, u := range users {
		seedUser(t, h, u)
	}
}

func listAs(t *testing.T, h *Handler, roles []string) []string {
	t.Helper()
	rec := httptest.NewRecorder()
	h.adminListUsers(rec, authedRequest(t, h, http.MethodGet, "/auth/admin/users", "caller", "caller@example.org", roles, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list as %v: status = %d, want 200", roles, rec.Code)
	}
	var got []adminUser
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	ids := make([]string, 0, len(got))
	for _, u := range got {
		ids = append(ids, u.ID)
	}
	sort.Strings(ids)
	return ids
}

func TestAdminListUsers_ScopedToWhatTheCallerCovers(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	cases := []struct {
		name  string
		roles []string
		want  []string
	}{
		{"a global admin sees everyone, including the branchless",
			[]string{authz.RoleAdmin}, []string{"g1", "k1", "k2", "nobody", "o1", "t1"}},
		{"a WSKO admin sees everyone too",
			[]string{authz.RoleWSKOAdmin}, []string{"g1", "k1", "k2", "nobody", "o1", "t1"}},
		{"a federation admin sees every branch in their federation",
			[]string{authz.FederationAdmin("SE")}, []string{"g1", "k1", "k2"}},
		{"and no branch outside it, nor the branchless",
			[]string{authz.FederationAdmin("NO")}, []string{"o1"}},
		{"a branch admin sees their own branch",
			[]string{authz.BranchAdmin("karlstad")}, []string{"k1", "k2"}},
		{"two branch roles are unioned, not fought over",
			[]string{authz.BranchAdmin("karlstad"), authz.BranchAdmin("oslo")}, []string{"k1", "k2", "o1"}},
		{"a WSKO-attached branch is nobody's federation business",
			[]string{authz.FederationAdmin("SE"), authz.FederationAdmin("NO")}, []string{"g1", "k1", "k2", "o1"}},
		{"an admin of a branch that does not exist sees nothing",
			[]string{authz.BranchAdmin("atlantis")}, []string{}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := listAs(t, h, c.roles); !equalIDs(got, c.want) {
				t.Errorf("listing = %v, want %v", got, c.want)
			}
		})
	}
}

func equalIDs(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}

// The delegation rule, exercised through the endpoint that enforces it: you may
// grant exactly the roles whose scope you already cover.
func TestAdminSetRoles_DelegatesDownwardsOnly(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	setRoles := func(t *testing.T, callerRoles []string, targetID string, roles []string) int {
		t.Helper()
		rec := httptest.NewRecorder()
		req := authedRequest(t, h, http.MethodPut, "/auth/admin/users/"+targetID+"/roles",
			"caller", "caller@example.org", callerRoles, map[string][]string{"roles": roles})
		req.SetPathValue("id", targetID)
		h.adminSetRoles(rec, req)
		return rec.Code
	}

	fedSE := []string{authz.FederationAdmin("SE")}

	if code := setRoles(t, fedSE, "k1", []string{authz.BranchAdmin("karlstad")}); code != http.StatusNoContent {
		t.Errorf("federation admin appointing a branch admin inside their federation: %d, want 204", code)
	}
	if roles, _ := h.roles.Roles("k1@example.org"); len(roles) != 1 || roles[0] != authz.BranchAdmin("karlstad") {
		t.Errorf("roles after grant = %v", roles)
	}

	if code := setRoles(t, fedSE, "k1", []string{authz.RoleAdmin}); code != http.StatusForbidden {
		t.Errorf("federation admin minting a global admin: %d, want 403", code)
	}
	if code := setRoles(t, fedSE, "k1", []string{authz.RoleWSKOAdmin}); code != http.StatusForbidden {
		t.Errorf("federation admin minting a WSKO admin: %d, want 403", code)
	}
	if code := setRoles(t, fedSE, "k1", []string{authz.BranchAdmin("oslo")}); code != http.StatusForbidden {
		t.Errorf("Swedish federation admin appointing a Norwegian branch admin: %d, want 403", code)
	}
	if code := setRoles(t, []string{authz.BranchAdmin("karlstad")}, "k1", []string{authz.FederationAdmin("SE")}); code != http.StatusForbidden {
		t.Errorf("branch admin promoting into their federation: %d, want 403", code)
	}
	if code := setRoles(t, fedSE, "k1", []string{"wizard"}); code != http.StatusBadRequest {
		t.Errorf("a role nobody defined: %d, want 400", code)
	}

	// The failed attempts changed nothing.
	if roles, _ := h.roles.Roles("k1@example.org"); len(roles) != 1 || roles[0] != authz.BranchAdmin("karlstad") {
		t.Errorf("roles after the refusals = %v, want the original grant", roles)
	}
}

// Roles the caller could not have granted are preserved rather than dropped,
// because only the difference is checked. The alternative would let a branch
// admin quietly strip a WSKO admin by saving a form that never showed the role.
func TestAdminSetRoles_LeavesRolesItCannotGrantAlone(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	if err := h.roles.SetRoles("k1@example.org", []string{authz.RoleWSKOAdmin}); err != nil {
		t.Fatalf("seed target roles: %v", err)
	}

	caller := []string{authz.BranchAdmin("karlstad")}
	send := func(roles []string) int {
		rec := httptest.NewRecorder()
		req := authedRequest(t, h, http.MethodPut, "/auth/admin/users/k1/roles",
			"caller", "caller@example.org", caller, map[string][]string{"roles": roles})
		req.SetPathValue("id", "k1")
		h.adminSetRoles(rec, req)
		return rec.Code
	}

	// Adding one they may grant, while carrying the untouchable one through.
	if code := send([]string{authz.RoleWSKOAdmin, authz.BranchAdmin("karlstad")}); code != http.StatusNoContent {
		t.Fatalf("carrying an unchanged role through: %d, want 204", code)
	}
	roles, _ := h.roles.Roles("k1@example.org")
	if len(roles) != 2 {
		t.Errorf("roles = %v, want both preserved", roles)
	}

	// Removing it is a change, and therefore refused.
	if code := send([]string{authz.BranchAdmin("karlstad")}); code != http.StatusForbidden {
		t.Errorf("branch admin removing a WSKO admin role: %d, want 403", code)
	}
	if roles, _ := h.roles.Roles("k1@example.org"); len(roles) != 2 {
		t.Errorf("roles after the refusal = %v, want both still there", roles)
	}
}

// A user outside the caller's scope is reported missing rather than forbidden:
// the listing already hides them, and a 403 would confirm the account exists.
func TestAdmin_UserOutsideTheCallersScopeIsNotFound(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	caller := []string{authz.BranchAdmin("karlstad")}

	for _, target := range []string{"o1", "nobody"} {
		t.Run(target, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := authedRequest(t, h, http.MethodPatch, "/auth/admin/users/"+target,
				"caller", "caller@example.org", caller, map[string]string{"displayName": "Renamed"})
			req.SetPathValue("id", target)
			h.adminUpdateUser(rec, req)
			if rec.Code != http.StatusNotFound {
				t.Errorf("rename: status = %d, want 404", rec.Code)
			}

			rec = httptest.NewRecorder()
			req = authedRequest(t, h, http.MethodPut, "/auth/admin/users/"+target+"/roles",
				"caller", "caller@example.org", caller, map[string][]string{"roles": {}})
			req.SetPathValue("id", target)
			h.adminSetRoles(rec, req)
			if rec.Code != http.StatusNotFound {
				t.Errorf("set roles: status = %d, want 404", rec.Code)
			}

			rec = httptest.NewRecorder()
			req = authedRequest(t, h, http.MethodPost, "/auth/admin/users/"+target+"/logout",
				"caller", "caller@example.org", caller, nil)
			req.SetPathValue("id", target)
			h.adminLogoutUser(rec, req)
			if rec.Code != http.StatusNotFound {
				t.Errorf("force logout: status = %d, want 404", rec.Code)
			}
		})
	}

	// The same branch admin can act on their own member, so the 404s above are
	// about scope rather than about the endpoint being broken.
	rec := httptest.NewRecorder()
	req := authedRequest(t, h, http.MethodPatch, "/auth/admin/users/k1",
		"caller", "caller@example.org", caller, map[string]string{"displayName": "Renamed"})
	req.SetPathValue("id", "k1")
	h.adminUpdateUser(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Errorf("renaming their own member: status = %d, want 204", rec.Code)
	}
}

// Holding no recognised role at all is a 403 before any target is read, so a
// plain user cannot probe for which ids exist.
func TestAdmin_UnrecognisedRolesAreNotAdminRoles(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	for _, roles := range [][]string{nil, {}, {"wizard"}, {"branch_admin"}, {"branch_admin:"}} {
		rec := httptest.NewRecorder()
		h.adminListUsers(rec, authedRequest(t, h, http.MethodGet, "/auth/admin/users",
			"caller", "caller@example.org", roles, nil))
		if rec.Code != http.StatusForbidden {
			t.Errorf("roles %v: status = %d, want 403", roles, rec.Code)
		}
	}
}
