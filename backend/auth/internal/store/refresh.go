package store

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"strings"
	"time"
)

const RefreshTokenTTL = 30 * 24 * time.Hour

// RefreshToken is an opaque, server-side token that outlives the short-lived
// JWT access token. Its ID encodes the owning user ID and a family ID so stores
// can derive the partition key without a separate lookup and detect token replay.
//
// Token format: "{userID}.{familyID}.{32-random-bytes-base64url}"
// '.' is not a base64url character, so the split is unambiguous.
type RefreshToken struct {
	ID        string `json:"id"`        // the full token value (sent to client)
	UserID    string `json:"userId"`    // extracted from ID; used as partition key
	FamilyID  string `json:"familyId"`  // shared across rotations in one login session
	ExpiresAt string `json:"expiresAt"` // RFC3339
	CreatedAt string `json:"createdAt"`
}

// NewFamilyID generates a fresh family identifier for a new login session.
func NewFamilyID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("rand.Read: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// NewRefreshToken generates a fresh token for the given user within a family.
// Pass the familyID from the previous token when rotating; call NewFamilyID()
// for a brand-new login session.
func NewRefreshToken(userID, familyID string) (*RefreshToken, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, fmt.Errorf("rand.Read: %w", err)
	}
	id := userID + "." + familyID + "." + base64.RawURLEncoding.EncodeToString(b)
	now := time.Now().UTC()
	return &RefreshToken{
		ID:        id,
		UserID:    userID,
		FamilyID:  familyID,
		ExpiresAt: now.Add(RefreshTokenTTL).Format(time.RFC3339),
		CreatedAt: now.Format(time.RFC3339),
	}, nil
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

// FamilyIDFromTokenID parses the family ID (second segment) from a token value.
// Returns ("", false) if the format is not {userID}.{familyID}.{secret}.
func FamilyIDFromTokenID(tokenID string) (string, bool) {
	idx := strings.Index(tokenID, ".")
	if idx < 0 {
		return "", false
	}
	rest := tokenID[idx+1:]
	idx2 := strings.Index(rest, ".")
	if idx2 <= 0 {
		return "", false
	}
	return rest[:idx2], true
}

// RefreshTokenStore manages server-side refresh tokens.
type RefreshTokenStore interface {
	// Create stores a new refresh token.
	Create(token *RefreshToken) error
	// Find returns the token if it exists and has not expired, nil otherwise.
	Find(tokenID string) (*RefreshToken, error)
	// FindByFamilyID returns the active token for a given family, or nil if none.
	// Used to detect token replay: if a deleted token's family still has an active
	// member, the deleted token was stolen and replayed.
	FindByFamilyID(userID, familyID string) (*RefreshToken, error)
	// Delete removes a single token (used during rotation).
	Delete(tokenID string) error
	// DeleteByUserID removes all tokens for a user (logout, account deletion).
	DeleteByUserID(userID string) error
}
