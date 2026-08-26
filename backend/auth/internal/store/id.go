package store

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
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

// hashedFileName turns an arbitrary string into a stable, filesystem-safe name.
// The file stores use it where the natural key is an email address: an address
// is not a filename — it can hold characters a filesystem refuses — and it is
// not something to write into a directory listing either.
func hashedFileName(s string) string {
	h := sha256.Sum256([]byte(s))
	return base64.RawURLEncoding.EncodeToString(h[:])
}
