package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
)

// The browser is the only place that knows which language the app is being used
// in, and it has no other reason to tell us — so there is one endpoint whose
// whole job is to be told.
func TestSetMyLanguage(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedUser(t, h, &store.User{ID: "u1", Email: "member@example.org"})

	put := func(id, body string) int {
		rec := httptest.NewRecorder()
		req := authedRequest(t, h, http.MethodPut, "/auth/me/language", id, "member@example.org", nil,
			map[string]string{"language": body})
		h.setMyLanguage(rec, req)
		return rec.Code
	}

	if code := put("u1", "sv"); code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", code)
	}
	user, _ := h.users.FindByID("u1")
	if user.Language != "sv" {
		t.Errorf("stored language = %q, want sv", user.Language)
	}

	// Case is not part of a language tag's meaning, and storing both "SV" and
	// "sv" would give the mail renderer two answers to the same question.
	if code := put("u1", "SV"); code != http.StatusNoContent {
		t.Errorf("uppercase tag: status = %d, want 204", code)
	}
	user, _ = h.users.FindByID("u1")
	if user.Language != "sv" {
		t.Errorf("after uppercase, language = %q, want sv", user.Language)
	}

	// This string is stored and reflected back to the client, so it is checked
	// for shape rather than taken on faith.
	for _, bad := range []string{"", "svenska!", "<script>", "s", "sv_SE"} {
		if code := put("u1", bad); code != http.StatusBadRequest {
			t.Errorf("language %q: status = %d, want 400", bad, code)
		}
	}

	// An unknown tag is accepted: adding a language to the frontend should not
	// need an edit here, and mail falls back when it renders.
	if code := put("u1", "fi"); code != http.StatusNoContent {
		t.Errorf("unknown but well-formed tag: status = %d, want 204", code)
	}

	rec := httptest.NewRecorder()
	h.setMyLanguage(rec, httptest.NewRequest(http.MethodPut, "/auth/me/language", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("unauthenticated: status = %d, want 401", rec.Code)
	}
}
