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

	tok, err := m.Issue(Identity{
		Subject: "user-123", Email: "anna@example.com", Name: "Anna Svensson",
		Roles: []string{"admin"}, Family: "fam-1", Branch: "karlstad", Federation: "SE",
	})
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
	if claims.Branch != "karlstad" {
		t.Errorf("branch = %q, want karlstad", claims.Branch)
	}
	if claims.Federation != "SE" {
		t.Errorf("federation = %q, want SE", claims.Federation)
	}
}

// A member of a WSKO-attached branch has a branch and no federation, and the
// difference has to survive the round trip: an omitted federation means the
// branch answers to the root, not that the claim was forgotten.
func TestIssue_BranchWithoutFederation(t *testing.T) {
	m := newTestManager(t)

	tok, err := m.Issue(Identity{Subject: "u1", Email: "u1@example.com", Branch: "tokyo"})
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	claims, err := m.Verify(tok)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if claims.Branch != "tokyo" || claims.Federation != "" {
		t.Errorf("branch = %q, federation = %q; want tokyo and nothing", claims.Branch, claims.Federation)
	}

	parts := strings.Split(tok, ".")
	if len(parts) != 3 {
		t.Fatalf("expected 3 token segments, got %d", len(parts))
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if strings.Contains(string(payload), `"fed"`) {
		t.Errorf("payload carries a fed claim despite no federation: %s", payload)
	}
	if !strings.Contains(string(payload), `"branch":"tokyo"`) {
		t.Errorf("payload is missing the branch claim: %s", payload)
	}
}

func TestIssue_EmptyNameOmittedFromPayload(t *testing.T) {
	m := newTestManager(t)

	tok, err := m.Issue(Identity{Subject: "user-123", Email: "anna@example.com"})
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
