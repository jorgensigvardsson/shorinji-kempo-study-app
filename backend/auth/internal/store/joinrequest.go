package store

// Statuses a join request can hold. There is no "approved": approval turns the
// request into a user record and deletes it, so an approved request is one that
// no longer exists.
const (
	JoinPending = "pending"
	JoinDenied  = "denied"
)

// DeniedRequestTTL is how long a denied request lingers before the store forgets
// it. It is kept at all only so the next admin to look can see that this address
// was turned down before, rather than judging blind — and it is kept for a
// bounded time because it is somebody's name and email address, held on somebody
// who is not a user.
const DeniedRequestTTL = int32(90 * 24 * 60 * 60)

// JoinRequest is somebody asking to be let into a branch. They are deliberately
// not a user: an applicant exists here and nowhere else until a branch admits
// them, which keeps the users container free of accounts nobody approved and
// makes the retention story a single sentence.
//
// The id is the lowercased email, so "one pending request per address" is
// structural rather than enforced — a point read answers it. The cost is that
// listing a branch's requests is a cross-partition query, which is the right
// trade for a container holding tens of items.
type JoinRequest struct {
	ID       string `json:"id"`             // lowercased email
	Email    string `json:"email"`          // as the applicant gave it
	Name     string `json:"name"`           // what they want to be called
	Note     string `json:"note,omitempty"` // free text; the basis on which an admin can judge
	BranchID string `json:"branchId"`

	// Provider and Sub name the identity that proved the address, so approval
	// links the account to that identity rather than to whatever was typed after.
	Provider string `json:"provider"`
	Sub      string `json:"sub"`

	// Language is the applicant's UI language, so the decision reaches them in
	// the language they applied in.
	Language string `json:"language"`

	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`

	DecidedAt string `json:"decidedAt,omitempty"`
	DecidedBy string `json:"decidedBy,omitempty"` // the deciding admin's user id

	// PreviouslyDeniedAt survives a re-application, so an admin looking at a
	// fresh request can see it is not the first time.
	PreviouslyDeniedAt string `json:"previouslyDeniedAt,omitempty"`

	// TTL is honoured by both stores: Cosmos deletes the item, and the file store
	// hides it from reads and sweeps it. Set only on denial — a pending request
	// carries none and therefore never expires.
	TTL int32 `json:"ttl,omitempty"`
}

// IsPending reports whether the request is still awaiting a decision.
func (r *JoinRequest) IsPending() bool { return r != nil && r.Status == JoinPending }

// JoinRequestStore persists pending and recently denied join requests.
type JoinRequestStore interface {
	// Get returns the request for an address, or (nil, nil) if there is none.
	Get(email string) (*JoinRequest, error)
	Save(req *JoinRequest) error
	// Delete removes a request outright. Used on approval and on withdrawal:
	// in both cases nothing should be left behind.
	Delete(email string) error
	// List returns every request. The container holds tens of items, so callers
	// filter for the branches they administer rather than the store doing it.
	List() ([]*JoinRequest, error)
}
