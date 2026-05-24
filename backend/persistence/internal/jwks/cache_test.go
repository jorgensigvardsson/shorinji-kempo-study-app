package jwks

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
)

// generateKey returns a 2048-bit RSA key for use in tests.
func generateKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}
	return key
}

// jwksJSON serialises one RSA public key as a minimal JWKS JSON document.
func jwksJSON(kid string, key *rsa.PrivateKey) []byte {
	n := base64.RawURLEncoding.EncodeToString(key.PublicKey.N.Bytes())
	e := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.PublicKey.E)).Bytes())
	doc := map[string]any{
		"keys": []map[string]any{
			{"kty": "RSA", "use": "sig", "alg": "RS256", "kid": kid, "n": n, "e": e},
		},
	}
	b, _ := json.Marshal(doc)
	return b
}

func TestRefresh_ParsesKey(t *testing.T) {
	key := generateKey(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(jwksJSON("key-1", key))
	}))
	defer srv.Close()

	c := NewCache(srv.URL)
	if err := c.Refresh(); err != nil {
		t.Fatalf("Refresh: %v", err)
	}

	got, err := c.PublicKey("key-1")
	if err != nil {
		t.Fatalf("PublicKey: %v", err)
	}
	if got.N.Cmp(key.PublicKey.N) != 0 {
		t.Error("returned key N does not match original")
	}
	if got.E != key.PublicKey.E {
		t.Errorf("returned key E = %d, want %d", got.E, key.PublicKey.E)
	}
}

func TestPublicKey_UnknownKid_TriggersRefresh(t *testing.T) {
	keyA := generateKey(t)
	keyB := generateKey(t)

	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			w.Write(jwksJSON("key-A", keyA))
		} else {
			// Second call (triggered by unknown kid) returns key-B as well.
			b, _ := json.Marshal(map[string]any{
				"keys": []map[string]any{
					{"kty": "RSA", "use": "sig", "alg": "RS256", "kid": "key-A", "n": base64.RawURLEncoding.EncodeToString(keyA.PublicKey.N.Bytes()), "e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(keyA.PublicKey.E)).Bytes())},
					{"kty": "RSA", "use": "sig", "alg": "RS256", "kid": "key-B", "n": base64.RawURLEncoding.EncodeToString(keyB.PublicKey.N.Bytes()), "e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(keyB.PublicKey.E)).Bytes())},
				},
			})
			w.Write(b)
		}
	}))
	defer srv.Close()

	c := NewCache(srv.URL)
	if err := c.Refresh(); err != nil {
		t.Fatalf("initial Refresh: %v", err)
	}

	// key-B is not in the cache yet — should trigger a refresh.
	got, err := c.PublicKey("key-B")
	if err != nil {
		t.Fatalf("PublicKey key-B: %v", err)
	}
	if got.N.Cmp(keyB.PublicKey.N) != 0 {
		t.Error("key-B N does not match")
	}
	if calls != 2 {
		t.Errorf("expected 2 HTTP calls, got %d", calls)
	}
}

func TestPublicKey_TrulyUnknownKid_ReturnsError(t *testing.T) {
	key := generateKey(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(jwksJSON("key-1", key))
	}))
	defer srv.Close()

	c := NewCache(srv.URL)
	if err := c.Refresh(); err != nil {
		t.Fatalf("Refresh: %v", err)
	}

	_, err := c.PublicKey("does-not-exist")
	if err == nil {
		t.Error("expected error for unknown kid, got nil")
	}
}

func TestRefresh_MalformedJSON_ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("not json"))
	}))
	defer srv.Close()

	c := NewCache(srv.URL)
	if err := c.Refresh(); err == nil {
		t.Error("expected error for malformed JSON, got nil")
	}
}
