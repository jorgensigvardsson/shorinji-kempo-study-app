package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
)

// authedRequest builds a request carrying an access-token cookie for a user with
// the given id/email/roles, so requireAdmin (which reads roles off the token) sees them.
func authedRequest(t *testing.T, h *Handler, method, path, id, email string, roles []string, body any) *http.Request {
	t.Helper()
	tok, err := h.tokens.Issue(id, email, "", roles)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	var r *http.Request
	if body != nil {
		b, _ := json.Marshal(body)
		r = httptest.NewRequest(method, path, strings.NewReader(string(b)))
	} else {
		r = httptest.NewRequest(method, path, nil)
	}
	r.AddCookie(&http.Cookie{Name: accessCookieName, Value: tok})
	return r
}

func seedUser(t *testing.T, h *Handler, u *store.User) {
	t.Helper()
	if err := h.users.Save(u); err != nil {
		t.Fatalf("seed user %s: %v", u.ID, err)
	}
}

func TestAdmin_RequiresAdminRole(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})

	// No token at all.
	rec := httptest.NewRecorder()
	h.adminListUsers(rec, httptest.NewRequest(http.MethodGet, "/auth/admin/users", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("no token: status = %d, want 401", rec.Code)
	}

	// Authenticated but not an admin.
	rec = httptest.NewRecorder()
	req := authedRequest(t, h, http.MethodGet, "/auth/admin/users", "u1", "u1@example.org", nil, nil)
	h.adminListUsers(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("non-admin: status = %d, want 403", rec.Code)
	}
}

func TestAdminListUsers(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedUser(t, h, &store.User{
		ID: "u1", Email: "code@example.org", DisplayName: "Code User",
		LinkedIdentities: map[string]store.LinkedIdentity{"email": {Sub: "code@example.org", Email: "code@example.org"}},
	})
	seedUser(t, h, &store.User{
		ID: "u2", Email: "oidc@gmail.com", DisplayName: "OIDC User",
		LinkedIdentities: map[string]store.LinkedIdentity{"google": {Sub: "g-123", Email: "oidc@gmail.com"}},
	})
	if err := h.roles.SetRoles("code@example.org", []string{"admin"}); err != nil {
		t.Fatalf("seed roles: %v", err)
	}

	rec := httptest.NewRecorder()
	h.adminListUsers(rec, authedRequest(t, h, http.MethodGet, "/auth/admin/users", "u1", "code@example.org", []string{"admin"}, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var got []adminUser
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 users, got %d", len(got))
	}
	byID := map[string]adminUser{}
	for _, u := range got {
		byID[u.ID] = u
	}
	if byID["u1"].OIDC {
		t.Errorf("u1 (email user) should not be flagged oidc")
	}
	if !byID["u2"].OIDC {
		t.Errorf("u2 (google user) should be flagged oidc")
	}
	if len(byID["u1"].Roles) != 1 || byID["u1"].Roles[0] != "admin" {
		t.Errorf("u1 roles = %v, want [admin]", byID["u1"].Roles)
	}
}

func TestAdminUpdateUser_NonOIDCOnly(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedUser(t, h, &store.User{
		ID: "u1", Email: "code@example.org", DisplayName: "Old Name",
		LinkedIdentities: map[string]store.LinkedIdentity{"email": {Sub: "code@example.org", Email: "code@example.org"}},
	})
	seedUser(t, h, &store.User{
		ID: "u2", Email: "oidc@gmail.com", DisplayName: "Provider Name",
		LinkedIdentities: map[string]store.LinkedIdentity{"google": {Sub: "g-123", Email: "oidc@gmail.com"}},
	})

	// Non-OIDC user: name is editable.
	rec := httptest.NewRecorder()
	req := authedRequest(t, h, http.MethodPatch, "/auth/admin/users/u1", "admin", "admin@example.org", []string{"admin"}, map[string]string{"displayName": "New Name"})
	req.SetPathValue("id", "u1")
	h.adminUpdateUser(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("non-oidc update: status = %d, want 204", rec.Code)
	}
	if u, _ := h.users.FindByID("u1"); u == nil || u.DisplayName != "New Name" {
		t.Fatalf("display name not updated: %+v", u)
	}

	// OIDC user: rejected.
	rec = httptest.NewRecorder()
	req = authedRequest(t, h, http.MethodPatch, "/auth/admin/users/u2", "admin", "admin@example.org", []string{"admin"}, map[string]string{"displayName": "Hacked"})
	req.SetPathValue("id", "u2")
	h.adminUpdateUser(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("oidc update: status = %d, want 409", rec.Code)
	}
}

func TestAdminSetRoles_PromoteDemoteAndSelfGuard(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedUser(t, h, &store.User{ID: "u1", Email: "target@example.org"})
	seedUser(t, h, &store.User{ID: "admin", Email: "admin@example.org"})
	if err := h.roles.SetRoles("admin@example.org", []string{"admin"}); err != nil {
		t.Fatalf("seed admin role: %v", err)
	}

	// Promote u1.
	rec := httptest.NewRecorder()
	req := authedRequest(t, h, http.MethodPut, "/auth/admin/users/u1/roles", "admin", "admin@example.org", []string{"admin"}, map[string]bool{"admin": true})
	req.SetPathValue("id", "u1")
	h.adminSetRoles(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("promote: status = %d, want 204", rec.Code)
	}
	if roles, _ := h.roles.Roles("target@example.org"); len(roles) != 1 || roles[0] != "admin" {
		t.Fatalf("u1 roles = %v, want [admin]", roles)
	}

	// Demote u1.
	rec = httptest.NewRecorder()
	req = authedRequest(t, h, http.MethodPut, "/auth/admin/users/u1/roles", "admin", "admin@example.org", []string{"admin"}, map[string]bool{"admin": false})
	req.SetPathValue("id", "u1")
	h.adminSetRoles(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("demote: status = %d, want 204", rec.Code)
	}
	if roles, _ := h.roles.Roles("target@example.org"); len(roles) != 0 {
		t.Fatalf("u1 roles = %v, want none", roles)
	}

	// Self-demotion is blocked.
	rec = httptest.NewRecorder()
	req = authedRequest(t, h, http.MethodPut, "/auth/admin/users/admin/roles", "admin", "admin@example.org", []string{"admin"}, map[string]bool{"admin": false})
	req.SetPathValue("id", "admin")
	h.adminSetRoles(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("self-demote: status = %d, want 409", rec.Code)
	}
	if roles, _ := h.roles.Roles("admin@example.org"); len(roles) != 1 {
		t.Fatalf("admin should still be admin, got %v", roles)
	}
}
