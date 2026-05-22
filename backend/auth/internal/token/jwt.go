package token

import (
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// AccessTokenTTL is intentionally generous: a typical Shorinji Kempo training
// session runs 2 hours, but with warm-up, cool-down, and travel it can stretch
// past 4 hours. 8 hours covers a full training day without forcing mid-session
// re-authentication. Proper refresh-token rotation (Phase 7) will make this
// a non-issue in production.
const AccessTokenTTL = 8 * time.Hour

type Claims struct {
	jwt.RegisteredClaims
	Email string `json:"email"`
}

type Manager struct {
	privateKey *rsa.PrivateKey
	issuer     string
	kid        string
}

func NewManager(key *rsa.PrivateKey, issuer string) *Manager {
	// Derive key ID from the first 8 bytes of the public key modulus hash.
	// Changes automatically when the key is rotated.
	h := sha256.Sum256(key.PublicKey.N.Bytes())
	kid := base64.RawURLEncoding.EncodeToString(h[:8])
	return &Manager{privateKey: key, issuer: issuer, kid: kid}
}

// Issue mints a signed RS256 access token for the given user.
func (m *Manager) Issue(sub, email string) (string, error) {
	now := time.Now()
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    m.issuer,
			Subject:   sub,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(AccessTokenTTL)),
		},
		Email: email,
	}
	t := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	t.Header["kid"] = m.kid
	return t.SignedString(m.privateKey)
}

// Verify parses and validates a signed token, returning its claims.
func (m *Manager) Verify(tokenStr string) (*Claims, error) {
	t, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return &m.privateKey.PublicKey, nil
	}, jwt.WithIssuer(m.issuer), jwt.WithExpirationRequired())
	if err != nil {
		return nil, err
	}
	claims, ok := t.Claims.(*Claims)
	if !ok {
		return nil, fmt.Errorf("invalid claims type")
	}
	return claims, nil
}

// JWKS returns the JSON Web Key Set document for the current public key.
func (m *Manager) JWKS() (json.RawMessage, error) {
	pub := &m.privateKey.PublicKey
	jwk := map[string]any{
		"kty": "RSA",
		"use": "sig",
		"alg": "RS256",
		"kid": m.kid,
		"n":   base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
		"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes()),
	}
	return json.Marshal(map[string]any{"keys": []any{jwk}})
}
