package api

import (
	"context"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/authclient"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/push"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/store"
)

// VAPID public key is only echoed back; any non-empty string works for tests.
const testVAPIDPublic = "BMFC5ak6g3tvewUomeT9j-88XsBs0H8rS-0jIOi5JWg2QK_ZOan24AyRro7USk33XsqgUKYq_4vqt9dJ5TYXBTw"
const testVAPIDPrivate = "DsidlmkQ3_MmHM9RsbpNp2TqP8Seh-aD4Otm4dTZxZQ"

// stubAudienceResolver stands in for a call to auth's POST
// /auth/admin/push-audience, so cookie-path broadcast tests don't need a real
// auth service listening.
type stubAudienceResolver struct {
	result *authclient.Result
	status int
	err    error
}

func (s *stubAudienceResolver) ResolveAudience(_ context.Context, _ string, _ []authclient.Scope) (*authclient.Result, int, error) {
	return s.result, s.status, s.err
}

func newPushHandler(t *testing.T, adminToken string, resolver audienceResolver) (*Handler, *staticKeySource, store.PushStore) {
	t.Helper()
	key := generateTestKey(t)
	ks := &staticKeySource{kid: "k1", key: &key.PublicKey}
	ps := store.NewFilePushStore(t.TempDir())
	h := NewHandler(nil, ks, "http://frontend", testIssuer, nil).
		WithPush(ps, push.New(testVAPIDPublic, testVAPIDPrivate, "mailto:test@example.com"), adminToken, resolver)
	return h, ks, ps
}

func TestPublicKey_ReturnsVAPIDKey(t *testing.T) {
	h, _, _ := newPushHandler(t, "", nil)
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

// asUser attaches a user ID the way authMiddleware does, so handler-level tests
// can run without minting a token.
func asUser(req *http.Request, userID string) *http.Request {
	return req.WithContext(context.WithValue(req.Context(), userIDKey, userID))
}

func TestSubscribe_StoresSubscriptionForUser(t *testing.T) {
	h, _, ps := newPushHandler(t, "", nil)
	body := `{"endpoint":"https://push.example/x","keys":{"p256dh":"pk","auth":"ak"}}`
	req := asUser(httptest.NewRequest(http.MethodPost, "/push/subscribe", strings.NewReader(body)), "user-7")
	rec := httptest.NewRecorder()
	h.subscribe(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("got %d, want 201", rec.Code)
	}
	subs, err := ps.ListSubscriptions()
	if err != nil || len(subs) != 1 {
		t.Fatalf("expected 1 stored sub, got %d (err=%v)", len(subs), err)
	}
	if subs[0].P256dh != "pk" || subs[0].Auth != "ak" || subs[0].UserID != "user-7" {
		t.Errorf("stored sub mismatch: %+v", subs[0])
	}
}

// The app has no anonymous mode, so subscribing is gated by authMiddleware.
func TestSubscribe_WithoutSession_401(t *testing.T) {
	h, _, ps := newPushHandler(t, "", nil)
	body := `{"endpoint":"https://push.example/x","keys":{"p256dh":"pk","auth":"ak"}}`
	req := httptest.NewRequest(http.MethodPost, "/push/subscribe", strings.NewReader(body))
	rec := httptest.NewRecorder()
	authMiddleware(h.jwks, testIssuer, http.HandlerFunc(h.subscribe)).ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
	if subs, _ := ps.ListSubscriptions(); len(subs) != 0 {
		t.Errorf("expected nothing stored, got %+v", subs)
	}
}

func TestSubscribe_AssociatesUserFromCookie(t *testing.T) {
	h, _, ps := newPushHandler(t, "", nil)
	key := generateTestKey(t)
	// Re-point the handler's key source at this signing key.
	h.jwks = &staticKeySource{kid: "k1", key: &key.PublicKey}
	tok := signToken(t, key, "k1", "user-42", time.Now().Add(time.Hour))

	body := `{"endpoint":"https://push.example/y","keys":{"p256dh":"pk","auth":"ak"}}`
	req := httptest.NewRequest(http.MethodPost, "/push/subscribe", strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: "access_token", Value: tok})
	rec := httptest.NewRecorder()
	authMiddleware(h.jwks, testIssuer, http.HandlerFunc(h.subscribe)).ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("got %d, want 201", rec.Code)
	}
	subs, _ := ps.ListSubscriptions()
	if len(subs) != 1 || subs[0].UserID != "user-42" {
		t.Fatalf("expected sub tagged user-42, got %+v", subs)
	}
}

func TestSubscribe_MissingFields_400(t *testing.T) {
	h, _, _ := newPushHandler(t, "", nil)
	req := asUser(httptest.NewRequest(http.MethodPost, "/push/subscribe", strings.NewReader(`{"endpoint":"https://x"}`)), "user-7")
	rec := httptest.NewRecorder()
	h.subscribe(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestUnsubscribe_DeletesSubscription(t *testing.T) {
	h, _, ps := newPushHandler(t, "", nil)
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
	h, _, _ := newPushHandler(t, "secret", nil)
	req := httptest.NewRequest(http.MethodPost, "/push/broadcast", strings.NewReader(`{"title":"hi"}`))
	rec := httptest.NewRecorder()
	h.broadcast(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("got %d, want 401", rec.Code)
	}
}

func TestBroadcast_WrongToken_401(t *testing.T) {
	h, _, _ := newPushHandler(t, "secret", nil)
	req := httptest.NewRequest(http.MethodPost, "/push/broadcast", strings.NewReader(`{"title":"hi"}`))
	req.Header.Set("Authorization", "Bearer nope")
	rec := httptest.NewRecorder()
	h.broadcast(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("got %d, want 401", rec.Code)
	}
}

func TestBroadcast_NoTokenConfigured_401(t *testing.T) {
	h, _, _ := newPushHandler(t, "", nil) // broadcast disabled
	req := httptest.NewRequest(http.MethodPost, "/push/broadcast", strings.NewReader(`{"title":"hi"}`))
	req.Header.Set("Authorization", "Bearer anything")
	rec := httptest.NewRecorder()
	h.broadcast(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("got %d, want 401", rec.Code)
	}
}

// signRoleToken mints an access token carrying a "role" claim (a JSON array).
func signRoleToken(t *testing.T, key *rsa.PrivateKey, kid, sub string, roles []string) string {
	t.Helper()
	claims := jwt.MapClaims{
		"iss":  testIssuer,
		"sub":  sub,
		"aud":  testAudience,
		"exp":  time.Now().Add(time.Hour).Unix(),
		"iat":  time.Now().Unix(),
		"role": roles,
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = kid
	signed, err := tok.SignedString(key)
	if err != nil {
		t.Fatalf("sign role token: %v", err)
	}
	return signed
}

// A cookie-authorized broadcast no longer decides "may this caller send?"
// locally — it forwards the cookie to auth (stubbed here) and relays auth's
// answer. These tests exercise that relay, not the token's own role claim.

func cookieBroadcastRequest(t *testing.T, key *rsa.PrivateKey, sub string, body string) *http.Request {
	t.Helper()
	tok := signRoleToken(t, key, "k1", sub, nil)
	req := httptest.NewRequest(http.MethodPost, "/push/broadcast", strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: "access_token", Value: tok})
	return req
}

func TestBroadcast_CookiePath_AuthResolvesAll_Authorized(t *testing.T) {
	resolver := &stubAudienceResolver{result: &authclient.Result{All: true}, status: http.StatusOK}
	h, _, _ := newPushHandler(t, "", resolver)
	key := generateTestKey(t)
	h.jwks = &staticKeySource{kid: "k1", key: &key.PublicKey}

	req := cookieBroadcastRequest(t, key, "admin-user", `{"title":"hi"}`)
	rec := httptest.NewRecorder()
	h.broadcast(rec, req)

	// Authorized: with no subscriptions stored, the broadcast simply reports 0 sent.
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
}

func TestBroadcast_CookiePath_AuthRefuses_StatusRelayed(t *testing.T) {
	// auth's requireAnyAdmin returns 403 for an authenticated caller holding no
	// admin role at all — persistence has nothing to add to that decision, so
	// it passes the status straight through.
	resolver := &stubAudienceResolver{status: http.StatusForbidden}
	h, _, _ := newPushHandler(t, "", resolver)
	key := generateTestKey(t)
	h.jwks = &staticKeySource{kid: "k1", key: &key.PublicKey}

	req := cookieBroadcastRequest(t, key, "plain-user", `{"title":"hi"}`)
	rec := httptest.NewRecorder()
	h.broadcast(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("got %d, want 403", rec.Code)
	}
}

func TestBroadcast_CookiePath_AuthNamesBranchNotFound_404Relayed(t *testing.T) {
	resolver := &stubAudienceResolver{status: http.StatusNotFound}
	h, _, _ := newPushHandler(t, "", resolver)
	key := generateTestKey(t)
	h.jwks = &staticKeySource{kid: "k1", key: &key.PublicKey}

	req := cookieBroadcastRequest(t, key, "branch-admin", `{"title":"hi","audience":[{"kind":"branch","id":"other"}]}`)
	rec := httptest.NewRecorder()
	h.broadcast(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("got %d, want 404", rec.Code)
	}
}

func TestBroadcast_CookiePath_AuthUnavailable_503(t *testing.T) {
	resolver := &stubAudienceResolver{err: authclient.ErrUnavailable}
	h, _, _ := newPushHandler(t, "", resolver)
	key := generateTestKey(t)
	h.jwks = &staticKeySource{kid: "k1", key: &key.PublicKey}

	req := cookieBroadcastRequest(t, key, "admin-user", `{"title":"hi"}`)
	rec := httptest.NewRecorder()
	h.broadcast(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("got %d, want 503", rec.Code)
	}
}

func TestBroadcast_CookiePath_NoResolverConfigured_503(t *testing.T) {
	h, _, _ := newPushHandler(t, "", nil) // no audienceClient wired up
	key := generateTestKey(t)
	h.jwks = &staticKeySource{kid: "k1", key: &key.PublicKey}

	req := cookieBroadcastRequest(t, key, "admin-user", `{"title":"hi"}`)
	rec := httptest.NewRecorder()
	h.broadcast(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("got %d, want 503", rec.Code)
	}
}

func TestBroadcast_CookiePath_ScopedAudience_FiltersToNamedUsers(t *testing.T) {
	resolver := &stubAudienceResolver{result: &authclient.Result{UserIDs: []string{"user-a"}}, status: http.StatusOK}
	h, _, ps := newPushHandler(t, "", resolver)
	key := generateTestKey(t)
	h.jwks = &staticKeySource{kid: "k1", key: &key.PublicKey}

	ps.SaveSubscription(&store.PushSubscription{Endpoint: "https://push.example/a", P256dh: "p", Auth: "a", UserID: "user-a"})
	ps.SaveSubscription(&store.PushSubscription{Endpoint: "https://push.example/b", P256dh: "p", Auth: "a", UserID: "user-b"})

	req := cookieBroadcastRequest(t, key, "branch-admin", `{"title":"hi","audience":[{"kind":"branch","id":"karlstad"}]}`)
	rec := httptest.NewRecorder()
	h.broadcast(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	var res push.BroadcastResult
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatal(err)
	}
	// The fake endpoints can't actually be delivered to, so the send fails —
	// what this checks is that exactly one subscription was even attempted,
	// i.e. user-b's was filtered out before Broadcast ever saw it.
	if total := res.Sent + res.Pruned + res.Failed; total != 1 {
		t.Errorf("processed %d subscriptions, want 1 (user-a's only)", total)
	}
}

func TestBroadcast_TokenPath_DefaultAudience_Authorized(t *testing.T) {
	h, _, _ := newPushHandler(t, "secret", nil) // no resolver needed: token path never calls auth
	req := httptest.NewRequest(http.MethodPost, "/push/broadcast", strings.NewReader(`{"title":"hi"}`))
	req.Header.Set("Authorization", "Bearer secret")
	rec := httptest.NewRecorder()
	h.broadcast(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
}

func TestBroadcast_TokenPath_ScopedAudience_403(t *testing.T) {
	// PUSH_ADMIN_TOKEN carries no identity, so it may only ever mean everybody
	// — naming a branch is refused, not resolved.
	h, _, _ := newPushHandler(t, "secret", nil)
	req := httptest.NewRequest(http.MethodPost, "/push/broadcast",
		strings.NewReader(`{"title":"hi","audience":[{"kind":"branch","id":"karlstad"}]}`))
	req.Header.Set("Authorization", "Bearer secret")
	rec := httptest.NewRecorder()
	h.broadcast(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("got %d, want 403", rec.Code)
	}
}
