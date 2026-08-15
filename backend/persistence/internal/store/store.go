package store

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
)

// Document mirrors the AppDataDocument shape from the frontend.
// The Data field is kept as raw JSON so the server stays agnostic to its internals.
type Document struct {
	Version   int             `json:"version"`
	UpdatedAt string          `json:"updatedAt"`
	DeviceID  string          `json:"deviceId"`
	Data      json.RawMessage `json:"data"`

	// SchemaVersion records which shape of Data the document was last written in.
	//
	// Server-owned: it is taken from the writing client's declared version header and
	// never from the request body, so a client cannot claim to understand a shape it
	// does not by echoing back what it read. Being agnostic about the contents of Data
	// is fine; being agnostic about which clients may overwrite it is not, because a
	// client that drops the fields it does not recognise deletes them for every device.
	//
	// Zero means the document predates this field. See api.putDocument.
	SchemaVersion int `json:"schemaVersion,omitempty"`

	// ClientCompat records the highest schema the client that last wrote this document
	// said it could hold without dropping anything — a different claim from the shape
	// it writes, and the one writes are actually checked against.
	//
	// Kept so the spread of client versions can be counted from the data rather than
	// only from logs, which is what tells you whether a schema change is safe to make
	// yet. Server-owned, like SchemaVersion.
	ClientCompat int `json:"clientCompat,omitempty"`
}

// ErrPreconditionFailed means the caller's expected version of the document is no
// longer the stored one: another device wrote between this caller's read and write.
// The caller has to read again, merge, and retry — its own copy is stale.
var ErrPreconditionFailed = errors.New("document changed since it was read")

// Store persists one document per user, with optimistic concurrency.
//
// Every write states what the caller believed the stored state to be, and the store
// refuses the write if that belief turned out to be wrong. Without it, two devices
// syncing at the same time silently overwrite one another: both read the same
// document, both merge their own changes into it, and whichever writes last wins.
type Store interface {
	// Load returns the stored document and the ETag identifying that exact version,
	// or (nil, "", nil) when the user has no document yet.
	Load(userID string) (*Document, string, error)

	// Save writes doc and returns the ETag of the newly stored version.
	//
	// ifMatch is the ETag the caller last read. An empty ifMatch means the caller
	// believes no document exists yet, and the write only succeeds if that holds —
	// so two devices racing to create the first document cannot clobber each other
	// either. Both cases return ErrPreconditionFailed when the belief is wrong.
	Save(userID string, doc *Document, ifMatch string) (string, error)

	// SaveUnconditional writes doc with no concurrency check, overwriting whatever
	// is stored. It exists only for app versions predating optimistic concurrency,
	// whose PUTs carry no precondition at all; see putDocument. Prefer Save.
	SaveUnconditional(userID string, doc *Document) (string, error)

	Delete(userID string) error
}

// UserLister enumerates every user the store holds a document for.
//
// Kept out of Store because only the backfill needs it, and it is a full scan of a
// container deliberately built for point reads — the cost belongs to an operation run
// on purpose, not to an interface every caller sees.
type UserLister interface {
	ListUserIDs() ([]string, error)
}

// etagOf derives an ETag from the stored bytes, for stores that have no version
// identifier of their own. Content-derived rather than a counter, so it stays
// correct without the store having to remember anything between calls.
func etagOf(data []byte) string {
	sum := sha256.Sum256(data)
	return `"` + hex.EncodeToString(sum[:16]) + `"`
}
