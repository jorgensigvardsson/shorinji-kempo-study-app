package store

// Statuses a transfer request can hold. There is no "accepted": acceptance moves
// the member and deletes the request, so an accepted transfer is one that no
// longer exists — the member's branch is the record of it.
const (
	TransferPending  = "pending"
	TransferRejected = "rejected"
)

// RejectedTransferTTL is how long a refused transfer lingers. Same reasoning as
// DeniedRequestTTL: long enough that the next admin to look can see this member
// has asked before and been told no, bounded because it is a record of somebody
// being refused and there is no reason to keep it forever.
const RejectedTransferTTL = int32(90 * 24 * 60 * 60)

// TransferRequest is a member asking to be moved to another branch — because
// they have moved to another town, which is the ordinary reason and the whole
// point of Phase 4.
//
// The member asks for themselves. There is no handshake with the branch they are
// leaving: the kenshi is the one who moved, the receiving branch decides, and the
// old branch is told rather than asked. A member cannot be stranded by a club
// that never replies.
//
// The id is the member's own user id, so "one pending transfer per member" is
// structural rather than enforced, and "do I have one?" is a point read. Listing
// a branch's incoming transfers is then a cross-partition scan, which is the same
// trade join requests make for the same reason: this container holds a handful of
// items at a time.
type TransferRequest struct {
	ID string `json:"id"` // the member's user id

	// FromBranchID is where they were when they asked, kept so the admin deciding
	// can see where the member is coming from without a second lookup. The branch
	// told "one of yours has left" is read fresh at acceptance instead: if an admin
	// moved them in the meantime, the club they actually leave is that one.
	FromBranchID string `json:"fromBranchId,omitempty"`
	ToBranchID   string `json:"toBranchId"`

	Note string `json:"note,omitempty"` // the member's own words; the basis for a decision

	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`

	DecidedAt string `json:"decidedAt,omitempty"`
	DecidedBy string `json:"decidedBy,omitempty"` // the deciding admin's user id

	// PreviouslyRejectedAt survives a re-application, so an admin looking at a
	// fresh request can see it is not the first time they have been asked.
	PreviouslyRejectedAt string `json:"previouslyRejectedAt,omitempty"`

	// TTL is honoured by both stores: Cosmos deletes the item, the file store
	// hides and sweeps it. Set only on rejection — a pending transfer carries
	// none and therefore waits as long as it takes.
	TTL int32 `json:"ttl,omitempty"`
}

// IsPending reports whether the transfer is still awaiting a decision.
func (t *TransferRequest) IsPending() bool { return t != nil && t.Status == TransferPending }

// TransferStore persists pending and recently refused transfer requests.
//
// Nothing about the member is stored here beyond their id: their name, address
// and language live on the user record, which is a point read away and cannot go
// stale against itself.
type TransferStore interface {
	// Get returns the transfer for a member, or (nil, nil) if there is none.
	Get(userID string) (*TransferRequest, error)
	Save(req *TransferRequest) error
	// Delete removes a transfer outright. Used on acceptance and on withdrawal:
	// in both cases nothing should be left behind.
	Delete(userID string) error
	// List returns every transfer. The container holds a handful, so callers
	// filter for the branches they administer rather than the store doing it.
	List() ([]*TransferRequest, error)
}
