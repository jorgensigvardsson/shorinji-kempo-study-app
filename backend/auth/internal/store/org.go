package store

import (
	"strings"

	"golang.org/x/text/language"
)

// Node types in the organization tree. WSKO itself is never stored: it is the
// implicit root, and a branch with no FederationID hangs directly from it. That
// is what makes "a branch belongs to a federation or to WSKO, never both and
// never neither" a shape rather than a rule anybody has to enforce.
const (
	NodeFederation = "federation"
	NodeBranch     = "branch"
)

// OrgNode is one node of the organization tree — a national federation or a
// branch. Both kinds share a container, discriminated by Type, because the tree
// is always read as a whole and is small enough to keep in memory.
//
// Federation IDs are ISO 3166-1 alpha-2 country codes and branch IDs are UUIDs,
// so the two id spaces cannot collide however they are mixed.
//
// Name is the organization's own name in its own language — "Svenska Shorinji
// Kempoförbundet", not a translation of it. It is a proper noun and is shown
// verbatim whatever language the reader is using the app in.
type OrgNode struct {
	ID           string `json:"id"`
	Type         string `json:"type"`
	Name         string `json:"name"`
	FederationID string `json:"federationId,omitempty"` // branches only; empty = attached directly to WSKO
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

// IsFederation and IsBranch spare callers from comparing Type by hand, which is
// where a typo would silently classify a node as neither.
func (n *OrgNode) IsFederation() bool { return n != nil && n.Type == NodeFederation }
func (n *OrgNode) IsBranch() bool     { return n != nil && n.Type == NodeBranch }

// OrgStore persists the organization tree. There is no Delete: dissolving a
// federation or closing a branch would strand the members pointing at it, and
// nothing in the app needs it yet.
type OrgStore interface {
	// List returns every node. Callers should expect a full scan — the tree is
	// tiny, and the service holds it in memory rather than querying it per request.
	List() ([]*OrgNode, error)
	Get(id string) (*OrgNode, error)
	Save(node *OrgNode) error
}

// ValidFederationID reports whether id is a well-formed federation identifier:
// an uppercase ISO 3166-1 alpha-2 country code, optionally suffixed with a digit
// sequence ("SE", "JP", "SE-2").
//
// The suffix exists because one federation per country is an assumption about
// the world, not a fact about it. Nothing else in the system changes if a
// country ever has two — but only if the identifier can express it, which is why
// the validator allows the form now rather than after it is needed.
func ValidFederationID(id string) bool {
	code, suffix, hasSuffix := strings.Cut(id, "-")
	if !isCountryCode(code) {
		return false
	}
	if !hasSuffix {
		return true
	}
	if suffix == "" || suffix[0] == '0' { // no "SE-" and no "SE-01"
		return false
	}
	for i := 0; i < len(suffix); i++ {
		if suffix[i] < '0' || suffix[i] > '9' {
			return false
		}
	}
	return true
}

// isCountryCode reports whether code is exactly two uppercase ASCII letters
// naming a real ISO 3166-1 country. The shape check comes first and stays
// strict on its own terms — language.ParseRegion is case-insensitive and
// also accepts alpha-3 codes ("SWE"), neither of which this system allows,
// since a federation id doubles as the exact suffix of a role string
// (authz.FederationAdmin) that has to match it byte for byte.
//
// IsCountry rules out the shapes ISO reserves without assigning to any
// country — XX, ZZ, the QM–QZ/XA–XZ user-assigned ranges, and supranational
// groupings like EU — which is how "JA", well-formed but nobody's code, once
// slipped through when this checked shape alone.
func isCountryCode(code string) bool {
	if len(code) != 2 || code[0] < 'A' || code[0] > 'Z' || code[1] < 'A' || code[1] > 'Z' {
		return false
	}
	region, err := language.ParseRegion(code)
	return err == nil && region.IsCountry()
}
