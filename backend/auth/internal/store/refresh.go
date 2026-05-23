package store

import (
	"crypto/rand"
	"encoding/base64"
	"strings"
	"time"
)

const RefreshTokenTTL = 30 * 24 * time.Hour

// RefreshToken is an opaque, server-side token that outlives the short-lived
// JWT access token. Its ID encodes the owning user ID so stores can derive
// the partition key without a separate lookup.
//
// Token format: "{userID}.{32-random-bytes-base64url}"
// The '.' separator is not a base64url character, so the split is unambiguous.
type RefreshToken struct {
	ID        string `json:"id"`        // the full token value (sent to client)
	UserID    string `json:"userId"`    // extracted from ID; used as partition key
	ExpiresAt string `json:"expiresAt"` // RFC3339
	CreatedAt string `json:"createdAt"`
}

// NewRefreshToken generates a fresh token for the given user.
func NewRefreshToken(userID string) *RefreshToken {
	b := make([]byte, 32)
	rand.Read(b)
	id := userID + "." + base64.RawURLEncoding.EncodeToString(b)
	now := time.Now().UTC()
	return &RefreshToken{
		ID:        id,
		UserID:    userID,
		ExpiresAt: now.Add(RefreshTokenTTL).Format(time.RFC3339),
		CreatedAt: now.Format(time.RFC3339),
	}
}

// UserIDFromTokenID parses the user ID prefix from a token value.
// Returns ("", false) if the format is invalid.
func UserIDFromTokenID(tokenID string) (string, bool) {
	idx := strings.Index(tokenID, ".")
	if idx <= 0 {
		return "", false
	}
	return tokenID[:idx], true
}

// RefreshTokenStore manages server-side refresh tokens.
type RefreshTokenStore interface {
	// Create stores a new refresh token.
	Create(token *RefreshToken) error
	// Find returns the token if it exists and has not expired, nil otherwise.
	Find(tokenID string) (*RefreshToken, error)
	// Delete removes a single token (used during rotation).
	Delete(tokenID string) error
	// DeleteByUserID removes all tokens for a user (logout, account deletion).
	DeleteByUserID(userID string) error
}
