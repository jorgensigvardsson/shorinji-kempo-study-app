package api

import (
	"crypto/rand"
	"crypto/rsa"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testIssuer   = "http://test-issuer"
const testAudience = "shorinji-persistence"

// staticKeySource implements KeySource for tests using a single fixed RSA key.
type staticKeySource struct {
	kid string
	key *rsa.PublicKey
}

func (s *staticKeySource) PublicKey(kid string) (*rsa.PublicKey, error) {
	if kid == s.kid {
		return s.key, nil
	}
	return nil, nil // unknown kid
}

func generateTestKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}
	return key
}

func signToken(t *testing.T, key *rsa.PrivateKey, kid, sub string, expiry time.Time) string {
	t.Helper()
	claims := jwt.RegisteredClaims{
		Issuer:    testIssuer,
		Subject:   sub,
		Audience:  jwt.ClaimStrings{testAudience},
		ExpiresAt: jwt.NewNumericDate(expiry),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = kid
	signed, err := tok.SignedString(key)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}

func okHandler(w http.ResponseWriter, r *http.Request) {
	id, _ := userIDFromContext(r.Context())
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(id))
}

func TestAuthMiddleware_NoCookie_Returns401(t *testing.T) {
	key := generateTestKey(t)
	ks := &staticKeySource{kid: "k1", key: &key.PublicKey}
	h := authMiddleware(ks, testIssuer, http.HandlerFunc(okHandler))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("got %d, want 401", rec.Code)
	}
}

func TestAuthMiddleware_ValidToken_CallsNextWithSub(t *testing.T) {
	key := generateTestKey(t)
	ks := &staticKeySource{kid: "k1", key: &key.PublicKey}
	h := authMiddleware(ks, testIssuer, http.HandlerFunc(okHandler))

	tokenStr := signToken(t, key, "k1", "user-uuid-123", time.Now().Add(time.Hour))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: "access_token", Value: tokenStr})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("got %d, want 200", rec.Code)
	}
	if body := rec.Body.String(); body != "user-uuid-123" {
		t.Errorf("sub in context = %q, want %q", body, "user-uuid-123")
	}
}

func TestAuthMiddleware_ExpiredToken_Returns401(t *testing.T) {
	key := generateTestKey(t)
	ks := &staticKeySource{kid: "k1", key: &key.PublicKey}
	h := authMiddleware(ks, testIssuer, http.HandlerFunc(okHandler))

	tokenStr := signToken(t, key, "k1", "user-uuid-123", time.Now().Add(-time.Minute))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: "access_token", Value: tokenStr})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("got %d, want 401", rec.Code)
	}
}

func TestAuthMiddleware_WrongSigningKey_Returns401(t *testing.T) {
	signingKey := generateTestKey(t)
	wrongKey := generateTestKey(t) // different key for verification
	ks := &staticKeySource{kid: "k1", key: &wrongKey.PublicKey}
	h := authMiddleware(ks, testIssuer, http.HandlerFunc(okHandler))

	tokenStr := signToken(t, signingKey, "k1", "user-uuid-123", time.Now().Add(time.Hour))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: "access_token", Value: tokenStr})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("got %d, want 401", rec.Code)
	}
}

func TestAuthMiddleware_GarbageToken_Returns401(t *testing.T) {
	key := generateTestKey(t)
	ks := &staticKeySource{kid: "k1", key: &key.PublicKey}
	h := authMiddleware(ks, testIssuer, http.HandlerFunc(okHandler))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: "access_token", Value: "not.a.jwt"})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("got %d, want 401", rec.Code)
	}
}
