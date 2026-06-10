package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/push"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/store"
)

// VAPID public key is only echoed back; any non-empty string works for tests.
const testVAPIDPublic = "BMFC5ak6g3tvewUomeT9j-88XsBs0H8rS-0jIOi5JWg2QK_ZOan24AyRro7USk33XsqgUKYq_4vqt9dJ5TYXBTw"
const testVAPIDPrivate = "DsidlmkQ3_MmHM9RsbpNp2TqP8Seh-aD4Otm4dTZxZQ"

func newPushHandler(t *testing.T, adminToken string) (*Handler, *staticKeySource, store.PushStore) {
	t.Helper()
	key := generateTestKey(t)
	ks := &staticKeySource{kid: "k1", key: &key.PublicKey}
	ps := store.NewFilePushStore(t.TempDir())
	h := NewHandler(nil, ks, "http://frontend", testIssuer, nil).
		WithPush(ps, push.New(testVAPIDPublic, testVAPIDPrivate, "mailto:test@example.com"), adminToken)
	return h, ks, ps
}

func TestPublicKey_ReturnsVAPIDKey(t *testing.T) {
	h, _, _ := newPushHandler(t, "")
	req := httptest.NewRequest(http.MethodGet, "/push/public-key", nil)
	rec := httptest.NewRecorder()
	h.publicKey(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	if body := rec.Body.String(); body != testVAPIDPublic {
		t.Errorf("public key = %q, want %q", body, testVAPIDPublic)
	}
}

func TestSubscribe_StoresSubscription(t *testing.T) {
	h, _, ps := newPushHandler(t, "")
	body := `{"endpoint":"https://push.example/x","keys":{"p256dh":"pk","auth":"ak"}}`
	req := httptest.NewRequest(http.MethodPost, "/push/subscribe", strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.subscribe(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("got %d, want 201", rec.Code)
	}
	subs, err := ps.ListSubscriptions()
	if err != nil || len(subs) != 1 {
		t.Fatalf("expected 1 stored sub, got %d (err=%v)", len(subs), err)
	}
	if subs[0].P256dh != "pk" || subs[0].Auth != "ak" || subs[0].UserID != "" {
		t.Errorf("stored sub mismatch: %+v", subs[0])
	}
}

func TestSubscribe_AssociatesUserFromCookie(t *testing.T) {
	h, _, ps := newPushHandler(t, "")
	key := generateTestKey(t)
	// Re-point the handler's key source at this signing key.
	h.jwks = &staticKeySource{kid: "k1", key: &key.PublicKey}
	tok := signToken(t, key, "k1", "user-42", time.Now().Add(time.Hour))

	body := `{"endpoint":"https://push.example/y","keys":{"p256dh":"pk","auth":"ak"}}`
	req := httptest.NewRequest(http.MethodPost, "/push/subscribe", strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: "access_token", Value: tok})
	rec := httptest.NewRecorder()
	h.subscribe(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("got %d, want 201", rec.Code)
	}
	subs, _ := ps.ListSubscriptions()
	if len(subs) != 1 || subs[0].UserID != "user-42" {
		t.Fatalf("expected sub tagged user-42, got %+v", subs)
	}
}

func TestSubscribe_MissingFields_400(t *testing.T) {
	h, _, _ := newPushHandler(t, "")
	req := httptest.NewRequest(http.MethodPost, "/push/subscribe", strings.NewReader(`{"endpoint":"https://x"}`))
	rec := httptest.NewRecorder()
	h.subscribe(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestUnsubscribe_DeletesSubscription(t *testing.T) {
	h, _, ps := newPushHandler(t, "")
	ps.SaveSubscription(&store.PushSubscription{Endpoint: "https://push.example/z", P256dh: "p", Auth: "a"})

	req := httptest.NewRequest(http.MethodPost, "/push/unsubscribe", strings.NewReader(`{"endpoint":"https://push.example/z"}`))
	rec := httptest.NewRecorder()
	h.unsubscribe(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204", rec.Code)
	}
	subs, _ := ps.ListSubscriptions()
	if len(subs) != 0 {
		t.Errorf("expected subscription removed, got %d", len(subs))
	}
}

func TestBroadcast_WithoutToken_401(t *testing.T) {
	h, _, _ := newPushHandler(t, "secret")
	req := httptest.NewRequest(http.MethodPost, "/push/broadcast", strings.NewReader(`{"title":"hi"}`))
	rec := httptest.NewRecorder()
	h.broadcast(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("got %d, want 401", rec.Code)
	}
}

func TestBroadcast_WrongToken_401(t *testing.T) {
	h, _, _ := newPushHandler(t, "secret")
	req := httptest.NewRequest(http.MethodPost, "/push/broadcast", strings.NewReader(`{"title":"hi"}`))
	req.Header.Set("Authorization", "Bearer nope")
	rec := httptest.NewRecorder()
	h.broadcast(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("got %d, want 401", rec.Code)
	}
}

func TestBroadcast_NoTokenConfigured_401(t *testing.T) {
	h, _, _ := newPushHandler(t, "") // broadcast disabled
	req := httptest.NewRequest(http.MethodPost, "/push/broadcast", strings.NewReader(`{"title":"hi"}`))
	req.Header.Set("Authorization", "Bearer anything")
	rec := httptest.NewRecorder()
	h.broadcast(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("got %d, want 401", rec.Code)
	}
}
