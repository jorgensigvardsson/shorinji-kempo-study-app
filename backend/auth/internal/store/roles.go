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
	// SetRoles replaces the roles for email. An empty roles slice removes the
	// assignment entirely so empties don't linger. Used by the admin UI to
	// promote/demote users.
	SetRoles(email string, roles []string) error
	// ListAll returns every assignment. Point reads answer "what may this person
	// do?"; this answers the reverse — "who administers this branch?" — which is
	// what a join request needs before it can notify anybody. The store is tiny
	// and the service caches the answer, so a full read is the right shape.
	ListAll() ([]RoleRecord, error)
}

// NormalizeEmail lowercases and trims an email so role lookups are case-insensitive.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}
