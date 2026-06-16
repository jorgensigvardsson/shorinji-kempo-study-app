package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
)

// seedRefreshToken creates a refresh token for the user in the given family and
// returns its full ID so the test can assert on its later presence/absence.
func seedRefreshToken(t *testing.T, h *Handler, userID, familyID string) string {
	t.Helper()
	rt, err := store.NewRefreshToken(userID, familyID)
	if err != nil {
		t.Fatalf("new refresh token: %v", err)
	}
	if err := h.refreshTokens.Create(rt); err != nil {
		t.Fatalf("create refresh token: %v", err)
	}
	return rt.ID
}

func mustExist(t *testing.T, h *Handler, tokenID string, want bool) {
	t.Helper()
	got, err := h.refreshTokens.Find(tokenID)
	if err != nil {
		t.Fatalf("find refresh token: %v", err)
	}
	if want && got == nil {
		t.Errorf("token %s should still exist, but is gone", tokenID)
	}
	if !want && got != nil {
		t.Errorf("token %s should be revoked, but still exists", tokenID)
	}
}

func TestAdminLogoutUser_RevokesAllSessions(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedUser(t, h, &store.User{ID: "admin", Email: "admin@example.org"})
	if err := h.roles.SetRoles("admin@example.org", []string{"admin"}); err != nil {
		t.Fatalf("seed admin role: %v", err)
	}
	seedUser(t, h, &store.User{ID: "target", Email: "target@example.org"})
	tokA := seedRefreshToken(t, h, "target", "famA")
	tokB := seedRefreshToken(t, h, "target", "famB")

	req := authedRequest(t, h, http.MethodPost, "/auth/admin/users/target/logout", "admin", "admin@example.org", []string{"admin"}, nil)
	req.SetPathValue("id", "target")
	rec := httptest.NewRecorder()
	h.adminLogoutUser(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	mustExist(t, h, tokA, false)
	mustExist(t, h, tokB, false)
}

func TestAdminLogoutUser_RequiresAdmin(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedUser(t, h, &store.User{ID: "target", Email: "target@example.org"})
	tok := seedRefreshToken(t, h, "target", "famA")

	// Authenticated but not an admin.
	req := authedRequest(t, h, http.MethodPost, "/auth/admin/users/target/logout", "u1", "u1@example.org", nil, nil)
	req.SetPathValue("id", "target")
	rec := httptest.NewRecorder()
	h.adminLogoutUser(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
	mustExist(t, h, tok, true) // unchanged
}

func TestLogoutOtherSessions_KeepsCurrentFamily(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedUser(t, h, &store.User{ID: "u1", Email: "u1@example.org"})
	current := seedRefreshToken(t, h, "u1", "famCurrent")
	other1 := seedRefreshToken(t, h, "u1", "famOther1")
	other2 := seedRefreshToken(t, h, "u1", "famOther2")

	// The access token carries famCurrent, marking it as the calling session.
	req := authedRequest(t, h, http.MethodPost, "/auth/sessions/logout-others", "u1", "u1@example.org", nil, nil, "famCurrent")
	rec := httptest.NewRecorder()
	h.logoutOtherSessions(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	mustExist(t, h, current, true)
	mustExist(t, h, other1, false)
	mustExist(t, h, other2, false)
}

func TestLogoutOtherSessions_NoFamilyClaimRefuses(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedUser(t, h, &store.User{ID: "u1", Email: "u1@example.org"})
	tok := seedRefreshToken(t, h, "u1", "famA")

	// Access token minted without a family claim (pre-feature token).
	req := authedRequest(t, h, http.MethodPost, "/auth/sessions/logout-others", "u1", "u1@example.org", nil, nil)
	rec := httptest.NewRecorder()
	h.logoutOtherSessions(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
	mustExist(t, h, tok, true) // nothing revoked
}
