package token

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"strings"
	"testing"
)

func newTestManager(t *testing.T) *Manager {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	return NewManager(key, "https://issuer.test")
}

func TestIssueVerify_RoundTripsClaims(t *testing.T) {
	m := newTestManager(t)

	tok, err := m.Issue("user-123", "anna@example.com", "Anna Svensson", []string{"admin"}, "fam-1")
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	claims, err := m.Verify(tok)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if claims.Subject != "user-123" {
		t.Errorf("sub = %q, want user-123", claims.Subject)
	}
	if claims.Family != "fam-1" {
		t.Errorf("family = %q, want fam-1", claims.Family)
	}
	if claims.Email != "anna@example.com" {
		t.Errorf("email = %q, want anna@example.com", claims.Email)
	}
	if claims.Name != "Anna Svensson" {
		t.Errorf("name = %q, want Anna Svensson", claims.Name)
	}
	if len(claims.Roles) != 1 || claims.Roles[0] != "admin" {
		t.Errorf("roles = %v, want [admin]", claims.Roles)
	}
}

func TestIssue_EmptyNameOmittedFromPayload(t *testing.T) {
	m := newTestManager(t)

	tok, err := m.Issue("user-123", "anna@example.com", "", nil, "")
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	parts := strings.Split(tok, ".")
	if len(parts) != 3 {
		t.Fatalf("expected 3 token segments, got %d", len(parts))
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if strings.Contains(string(payload), `"name"`) {
		t.Errorf("payload contains name claim despite empty name: %s", payload)
	}
}
