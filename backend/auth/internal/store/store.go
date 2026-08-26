package store

// LinkedIdentity holds the provider-specific identity for one OIDC provider.
type LinkedIdentity struct {
	Sub   string `json:"sub"`
	Email string `json:"email"` // email as reported by the provider; may differ from User.Email
}

// User is our internal user record. The ID is a server-generated UUID that is
// stable regardless of which provider the user authenticates with. Providers are
// tracked via LinkedIdentities so the same person can log in through multiple
// OIDC providers and still land on the same account.
//
// BranchID is the one branch this practitioner belongs to. It is empty only
// until the admission gate makes a branchless account impossible to create, and
// a user in that state is visible to a global admin alone — an empty branch
// resolves to no federation, and so to nobody's scope.
type User struct {
	ID               string                    `json:"id"`               // UUID v4
	Email            string                    `json:"email"`
	DisplayName      string                    `json:"displayName"`
	BranchID         string                    `json:"branchId,omitempty"`
	LinkedIdentities map[string]LinkedIdentity `json:"linkedIdentities"` // provider name → identity
	CreatedAt        string                    `json:"createdAt"`
	LastLoginAt      string                    `json:"lastLoginAt"`
	// Language is the UI language this member last used, as the app reports it.
	// It is here so that mail we send them unprompted — "somebody has asked to
	// join your branch" — can be written in a language they read: the browser
	// knows it and the server would otherwise never hear. Empty means nobody has
	// told us, and the default applies.
	Language         string                    `json:"language,omitempty"`
}

type UserStore interface {
	FindByID(id string) (*User, error)
	// FindByLinkedIdentity returns the user whose linkedIdentities[provider].sub == sub,
	// or (nil, nil) if no such user exists.
	FindByLinkedIdentity(provider, sub string) (*User, error)
	// List returns every user record. Used by the admin user-management UI;
	// callers should expect this to be a full scan, so it is for low-frequency
	// admin use only, not request-path lookups.
	List() ([]*User, error)
	// ListByBranches returns the users belonging to any of the named branches,
	// which is precisely what a federation or branch admin may see. Empty ids are
	// ignored rather than matched: a user with no branch belongs to nobody, and
	// must not be swept up by a caller whose own scope failed to resolve. Given
	// no usable ids it returns nothing without troubling the store.
	ListByBranches(branchIDs []string) ([]*User, error)
	Save(user *User) error
	Delete(id string) error
}
