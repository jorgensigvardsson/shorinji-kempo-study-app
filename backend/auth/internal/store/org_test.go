package store

import "testing"

func TestValidFederationID(t *testing.T) {
	valid := []string{"SE", "JP", "GB", "SE-2", "US-10"}
	for _, id := range valid {
		if !ValidFederationID(id) {
			t.Errorf("ValidFederationID(%q) = false, want true", id)
		}
	}

	invalid := []string{
		"",       // nothing
		"S",      // too short
		"SWE",    // alpha-3, not alpha-2
		"se",     // lowercase would never match the uppercase form in a role string
		"S3",     // digits are not letters
		"SE-",    // a suffix marker with no suffix
		"SE-0",   // there is no zeroth federation
		"SE-01",  // and no leading zeros, so one federation has one identifier
		"SE-2-3", // not a tree
		"SE 2",
		" SE",
	}
	for _, id := range invalid {
		if ValidFederationID(id) {
			t.Errorf("ValidFederationID(%q) = true, want false", id)
		}
	}
}

func TestOrgNodeTypePredicates(t *testing.T) {
	fed := &OrgNode{ID: "SE", Type: NodeFederation}
	br := &OrgNode{ID: "karlstad", Type: NodeBranch}
	var missing *OrgNode

	if !fed.IsFederation() || fed.IsBranch() {
		t.Error("a federation should be a federation and not a branch")
	}
	if !br.IsBranch() || br.IsFederation() {
		t.Error("a branch should be a branch and not a federation")
	}
	// A nil node is neither, rather than a panic in an authorization path.
	if missing.IsBranch() || missing.IsFederation() {
		t.Error("a nil node should be neither kind")
	}
	if odd := (&OrgNode{Type: "sect"}); odd.IsBranch() || odd.IsFederation() {
		t.Error("an unknown type should be neither kind")
	}
}
