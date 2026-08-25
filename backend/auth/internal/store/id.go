package store

import (
	"crypto/rand"
	"fmt"
)

// NewUUID generates a random (version 4) identifier.
//
// Ids are minted in several places — enrolling a user, creating a branch,
// seeding an organization from the migration tool — and they all want the same
// thing, so it lives beside the other id generators in this package rather than
// being copied to each caller or pulled in as a dependency.
func NewUUID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant RFC 4122
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}
