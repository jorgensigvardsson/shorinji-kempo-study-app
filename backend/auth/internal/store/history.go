package store

import "errors"

// Usage history: what happened to the membership, and how much the app was used,
// kept for good.
//
// Two kinds of entry share the container. Events are written by the auth service
// as things happen — an account created or deleted, a member moved, an
// application decided. Weekly snapshots are written by the usage-snapshot job,
// which reads a finished week back out of Application Insights before telemetry's
// 30-day retention takes it away.
//
// Nothing here identifies a person: no user id, no address, no pseudonym. An
// entry says what happened, where and when, and that is all. That is what lets
// the container be kept indefinitely and never changed: there is nothing in it
// that the right to erasure could reach, so nothing ever has to be taken out.
//
// It is append-only. An entry, once written, is never updated or deleted, which
// is also what lets the usage page cache everything it has already fetched.

// The kinds of entry. Type is also the Cosmos partition key.
const (
	HistoryAccountCreated = "account_created"
	HistoryAccountDeleted = "account_deleted"
	HistoryTransfer       = "transfer"
	HistoryApplication    = "application"
	HistoryWeek           = "week"
)

// How an account came to be, or a member came to move.
const (
	ViaApplied = "applied" // account_created: approved from an application
	ViaAdmin   = "admin"   // account_created: added by an admin; transfer: moved by one
	ViaRequest = "request" // transfer: the member asked and the branch accepted
)

// What became of an application.
const (
	ApplicationSubmitted = "submitted"
	ApplicationApproved  = "approved"
	ApplicationDeclined  = "declined"
	ApplicationWithdrawn = "withdrawn"
)

// HistoryEntry is one event or one weekly snapshot. Which fields are set depends
// on Type; the rest are omitted from the stored document.
type HistoryEntry struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	// At is when it happened. For a week, the moment it ended.
	At string `json:"at"`
	// RecordedAt is when it was written, stamped by the store. It is the cursor the
	// usage page pages by: a snapshot of last week is recorded today, so "what is
	// new since I last asked" is a question about RecordedAt, not At.
	RecordedAt string `json:"recordedAt"`

	Branch string `json:"branch,omitempty"` // account_created, account_deleted, application

	Via string `json:"via,omitempty"` // account_created, transfer

	// Lifetime is how long a deleted account existed, in coarse buckets (see
	// LifetimeBucket) — enough to see how long people stay, too coarse to say who.
	Lifetime string `json:"lifetime,omitempty"`

	From string `json:"from,omitempty"` // transfer
	To   string `json:"to,omitempty"`   // transfer

	Outcome string `json:"outcome,omitempty"` // application

	Week *WeekSnapshot `json:"week,omitempty"`
}

// WeekSnapshot is one finished Monday-to-Sunday week, UTC.
//
// People and the per-branch counts are distinct people, counted by Application
// Insights over the whole week; they cannot be added across weeks, and are not
// meant to be. Hours is the number of usage events, which arrive at most once an
// hour per device, so it reads as hours of use.
type WeekSnapshot struct {
	Start     string         `json:"start"` // Monday 00:00 UTC, RFC3339
	People    int            `json:"people"`
	ByBranch  map[string]int `json:"byBranch"`
	Hours     int            `json:"hours"`
	ByMode    map[string]int `json:"byMode"`    // people per display mode: standalone, browser
	ByVersion map[string]int `json:"byVersion"` // people per app build
	// Members is how many accounts each branch had when the snapshot was taken,
	// which for a week caught up late is a little after the week itself.
	Members map[string]int `json:"members"`
}

// WeekID is the id a week's snapshot is stored under. Deterministic, so a job
// that runs twice, or two that overlap, cannot store the same week twice.
func WeekID(start string) string { return "week:" + start[:10] }

// RecordedAtFormat is fixed-width on purpose. RFC3339Nano drops trailing zeros,
// so two of its timestamps can differ in length and then do not sort as text —
// and the Cosmos store compares them as text.
const RecordedAtFormat = "2006-01-02T15:04:05.000000Z"

// ErrHistoryExists is returned by Append for an id that is already taken — for a
// snapshot, a week somebody has already stored.
var ErrHistoryExists = errors.New("history entry already exists")

type HistoryStore interface {
	// Append writes a new entry, stamping RecordedAt. It never overwrites.
	Append(e *HistoryEntry) error
	// Since returns every entry recorded at or after recordedAt (RFC3339), or
	// everything for "". In no particular order.
	Since(recordedAt string) ([]*HistoryEntry, error)
	// LatestWeek returns the start of the newest stored week, or "" if none.
	LatestWeek() (string, error)
}
