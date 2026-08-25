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

// AccessTokenTTL is short-lived; the client uses the refresh token to obtain a
// new access token transparently before it expires.
const AccessTokenTTL = 1 * time.Hour

type Claims struct {
	jwt.RegisteredClaims
	Email string `json:"email"`
	// Name carries the user's display name so downstream services can identify
	// the user without a lookup against the auth user store. Omitted when empty;
	// consumers fall back to Email.
	Name string `json:"name,omitempty"`
	// Roles carries the user's roles (e.g. "admin"). Emitted as the "role" claim;
	// omitted entirely when the user has no roles.
	Roles []string `json:"role,omitempty"`
	// Family is the refresh-token family ID of the session this access token
	// belongs to. It lets authenticated endpoints identify the caller's own
	// session (e.g. to log out every *other* session). Omitted when empty, which
	// can happen for access tokens minted before this claim existed.
	Family string `json:"fam,omitempty"`
	// Branch is the branch the holder belongs to, and Federation the federation
	// that branch sits in, resolved when the token is minted so a service can
	// scope a request without asking the auth service anything.
	//
	// Both are omitted when empty, and empty is meaningful in both directions: a
	// member of a WSKO-attached branch has no federation, and a user admitted
	// before the branch model existed has neither. Both are stale for at most the
	// token's lifetime, which is the right precision for a branch transfer and
	// the wrong one for anything that must take effect at once.
	Branch     string `json:"branch,omitempty"`
	Federation string `json:"fed,omitempty"`
}

// Identity is everything a token says about its holder. It is a struct rather
// than a parameter list because most of its fields are strings, and a caller
// swapping two of them would mint a token that is wrong in a way nothing else
// would notice.
type Identity struct {
	Subject    string
	Email      string
	Name       string
	Roles      []string
	Family     string
	Branch     string
	Federation string
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

// Issue mints a signed RS256 access token describing the given identity.
func (m *Manager) Issue(id Identity) (string, error) {
	now := time.Now()
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    m.issuer,
			Subject:   id.Subject,
			Audience:  jwt.ClaimStrings{"shorinji-persistence"},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(AccessTokenTTL)),
		},
		Email:      id.Email,
		Name:       id.Name,
		Roles:      id.Roles,
		Family:     id.Family,
		Branch:     id.Branch,
		Federation: id.Federation,
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
	}, jwt.WithValidMethods([]string{"RS256"}), jwt.WithIssuer(m.issuer), jwt.WithExpirationRequired())
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
