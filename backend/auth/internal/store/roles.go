package store

import "strings"

// RoleRecord assigns a set of roles to a user, keyed by email address.
// Roles are managed out-of-band (e.g. an operator adds an item to the Cosmos
// `roles` container); the auth service only reads them to stamp the access token.
type RoleRecord struct {
	ID    string   `json:"id"` // lowercased email address
	Roles []string `json:"roles"`
}

// RoleStore resolves the roles granted to a user by email.
type RoleStore interface {
	// Roles returns the roles for email, or an empty slice if none are assigned.
	Roles(email string) ([]string, error)
}

// NormalizeEmail lowercases and trims an email so role lookups are case-insensitive.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}
