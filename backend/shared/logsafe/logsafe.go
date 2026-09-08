// Package logsafe turns identifiers into something that can be written to a log
// without writing down who somebody is.
//
// Operational logs exist to answer two questions: what went wrong, and for whom.
// The second one needs an identifier that is stable across lines, so entries about
// one person can be tied together — it does not need the person's email address,
// and an address is what makes a log file a thing that must be guarded, exported
// carefully, and never pasted into an issue.
//
// So addresses become a short keyed hash. Two lines about the same person still
// carry the same token, which is all a debugging session ever needed, and somebody
// reading the logs learns nothing about who that person is.
//
// Keyed, not a bare hash, and the distinction is the whole point: email addresses
// are guessable. A plain SHA-256 of one falls to a dictionary in seconds, so an
// unkeyed hash of an address would be an address with extra steps. With a key that
// never leaves the service, holding the logs is not enough to work backwards, even
// holding the membership list too.
package logsafe

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"sync/atomic"
)

// tokenLength is how much of the hash is kept, in hex characters. 12 is 48 bits:
// ample to keep a club's worth of members apart in a log file, and short enough
// that a line stays readable.
const tokenLength = 12

// Held atomically because Init runs during startup while nothing else is going,
// but the readers are request handlers on many goroutines.
var key atomic.Pointer[[]byte]

// Init sets the key used to pseudonymise identifiers. Call it once, during
// startup, before serving. Until it is called — and if it never is — Email fails
// closed and reports an address as "unkeyed" rather than reporting the address.
func Init(k []byte) {
	if len(k) == 0 {
		return
	}
	stored := make([]byte, len(k))
	copy(stored, k)
	key.Store(&stored)
}

// Email returns a stable, non-reversible token for an email address, of the form
// "usr:a1b2c3d4e5f6".
//
// Addresses are lowercased and trimmed first, so the same person written two ways
// — as they typed it and as it was stored — does not become two people in the log.
func Email(addr string) string {
	normalized := strings.ToLower(strings.TrimSpace(addr))
	if normalized == "" {
		return "usr:none"
	}
	k := key.Load()
	if k == nil {
		// Failing closed. An unkeyed hash of an address is not a pseudonym, and
		// the address itself is what this package exists to keep out of the log,
		// so neither is written: the line loses its detail rather than its safety.
		return "usr:unkeyed"
	}
	mac := hmac.New(sha256.New, *k)
	mac.Write([]byte(normalized))
	return "usr:" + hex.EncodeToString(mac.Sum(nil))[:tokenLength]
}
