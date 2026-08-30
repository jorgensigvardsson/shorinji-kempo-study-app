// Package authz answers one question for the whole application: do these roles
// grant authority over this scope?
//
// Every organizational permission reduces to that question. Seeing a user is
// authority over their branch. Creating a branch inside a federation is
// authority over that federation. Granting somebody a role is authority over the
// scope that role confers — which is what makes delegation downwards fall out
// for free rather than needing rules of its own.
//
// The package deliberately imports nothing but the standard library. It resolves
// branch-to-federation membership through an interface it declares itself, so
// the decision logic can be tested without a tree, a store, or a database.
package authz

import "strings"

// Kind is a level of the organization. WSKO is the root, so authority over it is
// authority over everything below.
type Kind string

const (
	KindWSKO       Kind = "wsko"
	KindFederation Kind = "federation"
	KindBranch     Kind = "branch"
)

// Scope is a place in the organization that authority can be held over. The
// JSON tags let it decode straight off the wire as a push-notification
// audience entry: {"kind":"branch","id":"…"}.
type Scope struct {
	Kind Kind   `json:"kind"`
	ID   string `json:"id,omitempty"` // empty for KindWSKO, which is a singleton
}

func WSKO() Scope                { return Scope{Kind: KindWSKO} }
func Federation(id string) Scope { return Scope{Kind: KindFederation, ID: id} }
func Branch(id string) Scope     { return Scope{Kind: KindBranch, ID: id} }

// Valid reports whether s is a shape ScopeOf could have produced: a known
// Kind, with an ID present for every kind but WSKO and absent for it. It is
// ScopeOf's counterpart for scope input that already arrives as {kind, id} —
// an audience entry off the wire — rather than as a role string.
func (s Scope) Valid() bool {
	switch s.Kind {
	case KindWSKO:
		return s.ID == ""
	case KindFederation, KindBranch:
		return s.ID != ""
	default:
		return false
	}
}

// The role vocabulary. Roles are flat strings carried in the JWT's existing
// "role" claim, scoped by suffix, so every exact-match check that already exists
// against "admin" keeps working untouched.
const (
	// RoleAdmin is the technical superuser: push broadcasts, force-logout, and
	// everything RoleWSKOAdmin can do. It predates the organization entirely.
	RoleAdmin = "admin"

	// RoleWSKOAdmin is authority over the whole organization and nothing else.
	// It is defined and grantable from the start but granted to nobody, so it
	// can diverge from RoleAdmin later without a migration to introduce it.
	RoleWSKOAdmin = "wsko_admin"

	prefixFederationAdmin = "federation_admin:"
	prefixBranchAdmin     = "branch_admin:"
)

// FederationAdmin and BranchAdmin build the role string for a scope. Use these
// rather than concatenating, so the prefixes have exactly one definition.
func FederationAdmin(federationID string) string { return prefixFederationAdmin + federationID }
func BranchAdmin(branchID string) string         { return prefixBranchAdmin + branchID }

// FederationResolver reports which federation a branch belongs to, returning ""
// for a branch attached directly to WSKO or one that does not exist. *org.Tree
// satisfies it; so does a map in a test.
type FederationResolver interface {
	FederationOf(branchID string) string
}

// ScopeOf returns the scope a role grants authority over, and whether the string
// is a role this system recognises at all. Unknown strings and scoped roles with
// an empty id ("branch_admin:") report false, which is what makes this the one
// validator for role input arriving over the wire.
func ScopeOf(role string) (Scope, bool) {
	switch role {
	case RoleAdmin, RoleWSKOAdmin:
		return WSKO(), true
	}
	if id, ok := strings.CutPrefix(role, prefixFederationAdmin); ok && id != "" {
		return Federation(id), true
	}
	if id, ok := strings.CutPrefix(role, prefixBranchAdmin); ok && id != "" {
		return Branch(id), true
	}
	return Scope{}, false
}

// Covers reports whether any of roles grants authority over want. Unrecognised
// roles are ignored rather than rejected: a token minted by a newer version of
// the service should not lock its holder out of an older one.
//
// fed may be nil, which costs a federation admin their authority over branches
// but never grants anything — callers without a tree to hand are refused, not
// waved through.
func Covers(roles []string, want Scope, fed FederationResolver) bool {
	for _, role := range roles {
		granted, ok := ScopeOf(role)
		if ok && covers(granted, want, fed) {
			return true
		}
	}
	return false
}

func covers(granted, want Scope, fed FederationResolver) bool {
	switch granted.Kind {
	case KindWSKO:
		return true

	case KindFederation:
		switch want.Kind {
		case KindFederation:
			return want.ID == granted.ID
		case KindBranch:
			// A branch belongs to this federation only if the tree says so. An
			// unknown branch, and one attached straight to WSKO, both resolve to
			// "" and are therefore not covered.
			return fed != nil && want.ID != "" && fed.FederationOf(want.ID) == granted.ID
		}
		return false // a federation admin is not a WSKO admin

	case KindBranch:
		// The narrowest authority there is: this branch, and no view upwards.
		return want.Kind == KindBranch && want.ID != "" && want.ID == granted.ID
	}
	return false
}
