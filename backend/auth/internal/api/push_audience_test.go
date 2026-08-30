package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
)

// pushAudience posts the given audience (nil for "omitted") and decodes the
// response, or returns the status when the call was refused.
func pushAudience(t *testing.T, h *Handler, callerRoles []string, audience []authz.Scope) (pushAudienceResponse, int) {
	t.Helper()
	var body any
	if audience != nil {
		body = map[string]any{"audience": audience}
	}
	rec := httptest.NewRecorder()
	req := authedRequest(t, h, http.MethodPost, "/auth/admin/push-audience", "caller", "caller@example.org", callerRoles, body)
	h.adminPushAudience(rec, req)

	var got pushAudienceResponse
	if rec.Code == http.StatusOK {
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatalf("decode: %v", err)
		}
		sort.Strings(got.UserIDs)
	}
	return got, rec.Code
}

func TestAdminPushAudience_RequiresAnyAdmin(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	rec := httptest.NewRecorder()
	h.adminPushAudience(rec, httptest.NewRequest(http.MethodPost, "/auth/admin/push-audience", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("no token: status = %d, want 401", rec.Code)
	}

	for _, roles := range [][]string{nil, {}, {"wizard"}} {
		if _, code := pushAudience(t, h, roles, []authz.Scope{authz.Branch("karlstad")}); code != http.StatusForbidden {
			t.Errorf("roles %v: status = %d, want 403", roles, code)
		}
	}
}

func TestAdminPushAudience_BranchAdmin_OwnBranch(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	got, code := pushAudience(t, h, []string{authz.BranchAdmin("karlstad")}, []authz.Scope{authz.Branch("karlstad")})
	if code != http.StatusOK {
		t.Fatalf("status = %d, want 200", code)
	}
	if got.All {
		t.Errorf("expected a scoped result, got all=true")
	}
	if want := []string{"k1", "k2"}; !equalIDs(got.UserIDs, want) {
		t.Errorf("userIds = %v, want %v", got.UserIDs, want)
	}
}

func TestAdminPushAudience_BranchAdmin_OtherBranch_404(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	for _, branch := range []string{"oslo", "tokyo", "no-such-branch"} {
		if _, code := pushAudience(t, h, []string{authz.BranchAdmin("karlstad")}, []authz.Scope{authz.Branch(branch)}); code != http.StatusNotFound {
			t.Errorf("karlstad admin naming %s: status = %d, want 404", branch, code)
		}
	}
}

func TestAdminPushAudience_FederationAdmin_OwnFederation(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	got, code := pushAudience(t, h, []string{authz.FederationAdmin("SE")}, []authz.Scope{authz.Federation("SE")})
	if code != http.StatusOK {
		t.Fatalf("status = %d, want 200", code)
	}
	if want := []string{"g1", "k1", "k2"}; !equalIDs(got.UserIDs, want) {
		t.Errorf("userIds = %v, want %v", got.UserIDs, want)
	}
}

func TestAdminPushAudience_FederationAdmin_BranchOutsideFederation_404(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	if _, code := pushAudience(t, h, []string{authz.FederationAdmin("SE")}, []authz.Scope{authz.Branch("oslo")}); code != http.StatusNotFound {
		t.Errorf("SE federation admin naming oslo: status = %d, want 404", code)
	}
	if _, code := pushAudience(t, h, []string{authz.FederationAdmin("SE")}, []authz.Scope{authz.Federation("NO")}); code != http.StatusNotFound {
		t.Errorf("SE federation admin naming NO: status = %d, want 404", code)
	}
}

func TestAdminPushAudience_FederationAndOwnBranch_Deduplicated(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	// karlstad is already in SE — naming both must not double it up or fail.
	got, code := pushAudience(t, h, []string{authz.FederationAdmin("SE")},
		[]authz.Scope{authz.Federation("SE"), authz.Branch("karlstad")})
	if code != http.StatusOK {
		t.Fatalf("status = %d, want 200", code)
	}
	if want := []string{"g1", "k1", "k2"}; !equalIDs(got.UserIDs, want) {
		t.Errorf("userIds = %v, want %v (no duplicates)", got.UserIDs, want)
	}
}

func TestAdminPushAudience_WSKO(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	for _, roles := range [][]string{{authz.RoleAdmin}, {authz.RoleWSKOAdmin}} {
		got, code := pushAudience(t, h, roles, []authz.Scope{authz.WSKO()})
		if code != http.StatusOK {
			t.Fatalf("roles %v: status = %d, want 200", roles, code)
		}
		if !got.All {
			t.Errorf("roles %v: expected all=true, got %+v", roles, got)
		}
	}

	// A federation admin does not cover the root.
	if _, code := pushAudience(t, h, []string{authz.FederationAdmin("SE")}, []authz.Scope{authz.WSKO()}); code != http.StatusForbidden {
		t.Errorf("federation admin naming wsko: status = %d, want 403", code)
	}
}

func TestAdminPushAudience_OmittedAudienceDefaultsToWSKO(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	got, code := pushAudience(t, h, []string{authz.RoleAdmin}, nil)
	if code != http.StatusOK || !got.All {
		t.Errorf("omitted audience for an admin: status = %d, got = %+v, want 200/all=true", code, got)
	}

	if _, code := pushAudience(t, h, []string{authz.BranchAdmin("karlstad")}, nil); code != http.StatusForbidden {
		t.Errorf("omitted audience for a branch admin: status = %d, want 403 (defaults to wsko, which they don't cover)", code)
	}
}

func TestAdminPushAudience_MalformedEntry_400(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)

	cases := [][]authz.Scope{
		{{Kind: "planet", ID: "earth"}},
		{{Kind: authz.KindBranch, ID: ""}},
		{{Kind: authz.KindFederation, ID: ""}},
	}
	for _, audience := range cases {
		if _, code := pushAudience(t, h, []string{authz.RoleAdmin}, audience); code != http.StatusBadRequest {
			t.Errorf("audience %+v: status = %d, want 400", audience, code)
		}
	}
}
