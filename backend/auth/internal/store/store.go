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
type User struct {
	ID               string                    `json:"id"`               // UUID v4
	Email            string                    `json:"email"`
	DisplayName      string                    `json:"displayName"`
	LinkedIdentities map[string]LinkedIdentity `json:"linkedIdentities"` // provider name → identity
	CreatedAt        string                    `json:"createdAt"`
	LastLoginAt      string                    `json:"lastLoginAt"`
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
	Save(user *User) error
	Delete(id string) error
}
