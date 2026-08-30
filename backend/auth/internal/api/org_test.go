package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
)

// The branch picker has to work before anybody has an account, so it is the one
// organization endpoint that takes no token at all.
func TestPublicBranches_NeedsNoSession(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	rec := httptest.NewRecorder()
	h.publicBranches(rec, httptest.NewRequest(http.MethodGet, "/auth/org/branches", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var got []publicBranch
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 4 {
		t.Fatalf("got %d branches, want 4", len(got))
	}

	byID := map[string]publicBranch{}
	for _, b := range got {
		byID[b.ID] = b
	}
	// The federation's name rides along so the picker can group without a
	// second request.
	if b := byID["karlstad"]; b.FederationID != "SE" || b.FederationName != "Svenska Shorinji Kempoförbundet" {
		t.Errorf("karlstad = %+v, want the Swedish federation named", b)
	}
	// A WSKO-attached branch names no federation, and the label for that group
	// is the frontend's to supply.
	if b := byID["tokyo"]; b.FederationID != "" || b.FederationName != "" {
		t.Errorf("tokyo = %+v, want no federation", b)
	}
}

func orgTreeAs(t *testing.T, h *Handler, roles []string) orgTreeResponse {
	t.Helper()
	rec := httptest.NewRecorder()
	h.adminOrgTree(rec, authedRequest(t, h, http.MethodGet, "/auth/admin/org", "caller", "caller@example.org", roles, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("org tree as %v: status = %d, want 200", roles, rec.Code)
	}
	var got orgTreeResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return got
}

func TestAdminOrgTree_ShowsOnlyWhatTheCallerCovers(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	t.Run("a global admin sees all of it, WSKO branches included", func(t *testing.T) {
		got := orgTreeAs(t, h, []string{authz.RoleAdmin})
		if len(got.Federations) != 2 {
			t.Errorf("federations = %d, want 2", len(got.Federations))
		}
		if len(got.WSKOBranches) != 1 || got.WSKOBranches[0].ID != "tokyo" {
			t.Errorf("wskoBranches = %+v, want just tokyo", got.WSKOBranches)
		}
	})

	t.Run("a federation admin sees their federation and nothing beside it", func(t *testing.T) {
		got := orgTreeAs(t, h, []string{authz.FederationAdmin("SE")})
		if len(got.Federations) != 1 || got.Federations[0].ID != "SE" {
			t.Fatalf("federations = %+v, want only SE", got.Federations)
		}
		if len(got.Federations[0].Branches) != 2 {
			t.Errorf("SE branches = %+v, want both", got.Federations[0].Branches)
		}
		if len(got.WSKOBranches) != 0 {
			t.Errorf("wskoBranches = %+v, want none", got.WSKOBranches)
		}
	})

	t.Run("a branch admin sees one branch, under the federation it belongs to", func(t *testing.T) {
		got := orgTreeAs(t, h, []string{authz.BranchAdmin("karlstad")})
		if len(got.Federations) != 1 || got.Federations[0].ID != "SE" {
			t.Fatalf("federations = %+v, want SE as the heading", got.Federations)
		}
		if len(got.Federations[0].Branches) != 1 || got.Federations[0].Branches[0].ID != "karlstad" {
			t.Errorf("branches = %+v, want only karlstad", got.Federations[0].Branches)
		}
	})

	t.Run("an admin of a WSKO-attached branch sees no federation at all", func(t *testing.T) {
		got := orgTreeAs(t, h, []string{authz.BranchAdmin("tokyo")})
		if len(got.Federations) != 0 {
			t.Errorf("federations = %+v, want none", got.Federations)
		}
		if len(got.WSKOBranches) != 1 || got.WSKOBranches[0].ID != "tokyo" {
			t.Errorf("wskoBranches = %+v, want tokyo", got.WSKOBranches)
		}
	})
}

func TestCreateFederation(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	create := func(roles []string, body any) int {
		rec := httptest.NewRecorder()
		h.createFederation(rec, authedRequest(t, h, http.MethodPost, "/auth/admin/federations",
			"caller", "caller@example.org", roles, body))
		return rec.Code
	}
	createRec := func(roles []string, body any) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		h.createFederation(rec, authedRequest(t, h, http.MethodPost, "/auth/admin/federations",
			"caller", "caller@example.org", roles, body))
		return rec
	}
	global := []string{authz.RoleAdmin}

	if code := create(global, map[string]string{"id": "JP", "name": "全日本少林寺拳法連盟"}); code != http.StatusCreated {
		t.Fatalf("create: %d, want 201", code)
	}
	if fed, ok := h.orgs.Federation("JP"); !ok || fed.Name != "全日本少林寺拳法連盟" {
		t.Errorf("federation not in the tree afterwards: %+v", fed)
	}

	if code := create(global, map[string]string{"id": "jp", "name": "Duplicate under another casing"}); code != http.StatusConflict {
		t.Errorf("duplicate id: %d, want 409", code)
	}
	if code := create(global, map[string]string{"id": "SWE", "name": "Alpha-3"}); code != http.StatusBadRequest {
		t.Errorf("alpha-3 id: %d, want 400", code)
	}
	// Well-formed — two uppercase letters — but not a real country: exactly the
	// shape a typo for Japan's real code (JP) takes. The body carries a
	// machine-readable reason, not just a generic 400, since the frontend
	// cannot show Go prose to a Japanese or Turkish admin and "bad request"
	// alone is indistinguishable from a blank name or any other rejected field.
	rec := createRec(global, map[string]string{"id": "JA", "name": "Typo for Japan"})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("well-formed but unassigned id: %d, want 400", rec.Code)
	}
	var body struct{ Error string `json:"error"` }
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Error != "invalid_federation_id" {
		t.Errorf(`body error = %q, want "invalid_federation_id"`, body.Error)
	}
	if code := create(global, map[string]string{"id": "DK", "name": "  "}); code != http.StatusBadRequest {
		t.Errorf("blank name: %d, want 400", code)
	}
	// Federations are peers; no federation admin is above another.
	if code := create([]string{authz.FederationAdmin("SE")}, map[string]string{"id": "DK", "name": "Dansk Shorinji Kempo"}); code != http.StatusForbidden {
		t.Errorf("federation admin creating a federation: %d, want 403", code)
	}
}

func TestCreateBranch(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	create := func(roles []string, body any) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		h.createBranch(rec, authedRequest(t, h, http.MethodPost, "/auth/admin/branches",
			"caller", "caller@example.org", roles, body))
		return rec
	}
	fedSE := []string{authz.FederationAdmin("SE")}

	rec := create(fedSE, map[string]string{"name": "Shorinji Kempo Malmö Branch", "federationId": "SE"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("federation admin creating in their own federation: %d, want 201", rec.Code)
	}
	var created map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode: %v", err)
	}
	newID, _ := created["id"].(string)
	if newID == "" {
		t.Fatal("created branch has no id")
	}
	if got := h.orgs.FederationOf(newID); got != "SE" {
		t.Errorf("new branch's federation = %q, want SE", got)
	}

	if rec := create(fedSE, map[string]string{"name": "Elsewhere", "federationId": "NO"}); rec.Code != http.StatusForbidden {
		t.Errorf("creating inside another federation: %d, want 403", rec.Code)
	}
	// Omitting the federation means WSKO-attached, which is not a federation
	// admin's to give — and is refused rather than quietly rewritten to theirs.
	if rec := create(fedSE, map[string]string{"name": "Independent"}); rec.Code != http.StatusForbidden {
		t.Errorf("federation admin creating a WSKO-attached branch: %d, want 403", rec.Code)
	}
	if rec := create([]string{authz.RoleAdmin}, map[string]string{"name": "Shorinji Kempo Reykjavík Branch"}); rec.Code != http.StatusCreated {
		t.Errorf("global admin creating a WSKO-attached branch: %d, want 201", rec.Code)
	}
	if rec := create([]string{authz.RoleAdmin}, map[string]string{"name": "Nowhere", "federationId": "XX"}); rec.Code != http.StatusBadRequest {
		t.Errorf("unknown federation: %d, want 400", rec.Code)
	}
	if rec := create(fedSE, map[string]string{"name": "   ", "federationId": "SE"}); rec.Code != http.StatusBadRequest {
		t.Errorf("blank name: %d, want 400", rec.Code)
	}
}

func TestUpdateBranch_RenameIsLocalButMovingIsNot(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	update := func(roles []string, id string, body any) int {
		rec := httptest.NewRecorder()
		req := authedRequest(t, h, http.MethodPatch, "/auth/admin/branches/"+id,
			"caller", "caller@example.org", roles, body)
		req.SetPathValue("id", id)
		h.updateBranch(rec, req)
		return rec.Code
	}
	branchAdmin := []string{authz.BranchAdmin("karlstad")}
	global := []string{authz.RoleAdmin}

	if code := update(branchAdmin, "karlstad", map[string]string{"name": "Shorinji Kempo Karlstad Branch"}); code != http.StatusOK {
		t.Fatalf("branch admin renaming their own branch: %d, want 200", code)
	}
	if b, _ := h.orgs.Branch("karlstad"); b.Name != "Shorinji Kempo Karlstad Branch" {
		t.Errorf("rename did not stick: %+v", b)
	}

	// Moving is two acts — leaving one place and joining another — and needs
	// authority over both. A branch admin has neither.
	if code := update(branchAdmin, "karlstad", map[string]string{"federationId": "NO"}); code != http.StatusForbidden {
		t.Errorf("branch admin moving their branch out: %d, want 403", code)
	}
	// Nor may the federation admin they belong to walk off with the club.
	if code := update([]string{authz.FederationAdmin("SE")}, "karlstad", map[string]string{"federationId": "NO"}); code != http.StatusForbidden {
		t.Errorf("federation admin moving a branch away: %d, want 403", code)
	}
	if got := h.orgs.FederationOf("karlstad"); got != "SE" {
		t.Fatalf("branch moved despite the refusals: federation = %q", got)
	}

	// A global admin covers both ends, so the move goes through and the tree
	// re-files it immediately.
	if code := update(global, "karlstad", map[string]string{"federationId": "NO"}); code != http.StatusOK {
		t.Fatalf("global admin moving a branch: %d, want 200", code)
	}
	if got := h.orgs.FederationOf("karlstad"); got != "NO" {
		t.Errorf("federation after the move = %q, want NO", got)
	}

	// Setting it to empty is a move to WSKO, not an omission.
	if code := update(global, "karlstad", map[string]string{"federationId": ""}); code != http.StatusOK {
		t.Fatalf("moving a branch to WSKO: %d, want 200", code)
	}
	if got := h.orgs.FederationOf("karlstad"); got != "" {
		t.Errorf("federation after moving to WSKO = %q, want empty", got)
	}
	if branches := h.orgs.BranchesIn(""); len(branches) != 2 {
		t.Errorf("WSKO branches = %v, want karlstad alongside tokyo", branches)
	}

	if code := update(global, "karlstad", map[string]string{}); code != http.StatusBadRequest {
		t.Errorf("a request that changes nothing: %d, want 400", code)
	}
	if code := update(branchAdmin, "oslo", map[string]string{"name": "Renamed"}); code != http.StatusNotFound {
		t.Errorf("renaming a branch outside the caller's scope: %d, want 404", code)
	}
}

// What a token says about where its holder trains, resolved when the token is
// minted so that no service has to ask the auth service afterwards.
func TestIdentityFor_ResolvesBranchAndFederation(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	cases := map[string]struct{ branch, federation string }{
		"k1":     {"karlstad", "SE"},
		"o1":     {"oslo", "NO"},
		"t1":     {"tokyo", ""}, // attached to WSKO, so no federation
		"nobody": {"", ""},      // no branch, so neither
	}
	for userID, want := range cases {
		user, err := h.users.FindByID(userID)
		if err != nil || user == nil {
			t.Fatalf("seed user %s missing: %v", userID, err)
		}
		id := h.identityFor(user, "fam-1")
		if id.Branch != want.branch || id.Federation != want.federation {
			t.Errorf("%s: branch = %q, federation = %q; want %q and %q",
				userID, id.Branch, id.Federation, want.branch, want.federation)
		}
		if id.Subject != userID || id.Family != "fam-1" {
			t.Errorf("%s: subject = %q, family = %q", userID, id.Subject, id.Family)
		}
	}

	// Roles come from the store at issue time, so a grant takes effect on the
	// holder's next token rather than needing them to sign in again.
	if err := h.roles.SetRoles("k1@example.org", []string{authz.BranchAdmin("karlstad")}); err != nil {
		t.Fatalf("grant: %v", err)
	}
	user, _ := h.users.FindByID("k1")
	if id := h.identityFor(user, "fam-1"); len(id.Roles) != 1 || id.Roles[0] != authz.BranchAdmin("karlstad") {
		t.Errorf("roles = %v, want the branch admin grant", id.Roles)
	}
}

// /auth/me is where the frontend learns its own branch, so it resolves the
// federation rather than making the client fetch the tree to find out.
func TestMe_CarriesBranchAndFederation(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	rec := httptest.NewRecorder()
	h.me(rec, authedRequest(t, h, http.MethodGet, "/auth/me", "k1", "k1@example.org", nil, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var got struct {
		BranchID   string `json:"branchId"`
		Federation string `json:"federation"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.BranchID != "karlstad" || got.Federation != "SE" {
		t.Errorf("me = %+v, want karlstad in SE", got)
	}
}
