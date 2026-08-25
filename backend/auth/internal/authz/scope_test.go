package authz

import "testing"

// A stand-in for the organization tree: authz only ever asks it one question.
type fakeFederations map[string]string

func (f fakeFederations) FederationOf(branchID string) string { return f[branchID] }

func TestScopeOf(t *testing.T) {
	cases := []struct {
		role  string
		want  Scope
		known bool
	}{
		{RoleAdmin, WSKO(), true},
		{RoleWSKOAdmin, WSKO(), true},
		{"federation_admin:SE", Federation("SE"), true},
		{"federation_admin:SE-2", Federation("SE-2"), true},
		{"branch_admin:8f3c", Branch("8f3c"), true},

		// A scoped role with nothing to scope it to is not a role.
		{"federation_admin:", Scope{}, false},
		{"branch_admin:", Scope{}, false},
		{"", Scope{}, false},
		{"root", Scope{}, false},
		{"Admin", Scope{}, false},        // roles are matched exactly, never folded
		{"branch_admin", Scope{}, false}, // the prefix alone is not the role
		{"xbranch_admin:8f3c", Scope{}, false},
	}
	for _, c := range cases {
		got, known := ScopeOf(c.role)
		if known != c.known || got != c.want {
			t.Errorf("ScopeOf(%q) = %+v, %t; want %+v, %t", c.role, got, known, c.want, c.known)
		}
	}
}

func TestRoleBuilders(t *testing.T) {
	if got := FederationAdmin("SE"); got != "federation_admin:SE" {
		t.Errorf("FederationAdmin(SE) = %q", got)
	}
	if got := BranchAdmin("8f3c"); got != "branch_admin:8f3c" {
		t.Errorf("BranchAdmin(8f3c) = %q", got)
	}
	// The builders and the parser must agree, or a granted role would be
	// unreadable by the very check it exists to satisfy.
	for _, id := range []string{"SE", "JP", "SE-2"} {
		if s, ok := ScopeOf(FederationAdmin(id)); !ok || s != Federation(id) {
			t.Errorf("round trip failed for federation %q", id)
		}
	}
	if s, ok := ScopeOf(BranchAdmin("8f3c")); !ok || s != Branch("8f3c") {
		t.Error("round trip failed for branch")
	}
}

func TestCovers(t *testing.T) {
	// Karlstad and Göteborg are Swedish; Oslo is Norwegian; Tokyo hangs
	// directly off WSKO with no federation at all.
	tree := fakeFederations{
		"karlstad": "SE",
		"goteborg": "SE",
		"oslo":     "NO",
		"tokyo":    "",
	}

	cases := []struct {
		name  string
		roles []string
		want  Scope
		ok    bool
	}{
		{"global admin over WSKO", []string{RoleAdmin}, WSKO(), true},
		{"global admin over a federation", []string{RoleAdmin}, Federation("SE"), true},
		{"global admin over a branch", []string{RoleAdmin}, Branch("oslo"), true},
		{"wsko admin over a branch", []string{RoleWSKOAdmin}, Branch("oslo"), true},

		{"federation admin over own federation", []string{FederationAdmin("SE")}, Federation("SE"), true},
		{"federation admin over own branch", []string{FederationAdmin("SE")}, Branch("karlstad"), true},
		{"federation admin over another federation's branch", []string{FederationAdmin("SE")}, Branch("oslo"), false},
		{"federation admin over another federation", []string{FederationAdmin("SE")}, Federation("NO"), false},
		{"federation admin is not a WSKO admin", []string{FederationAdmin("SE")}, WSKO(), false},
		{"federation admin over a WSKO-attached branch", []string{FederationAdmin("SE")}, Branch("tokyo"), false},
		{"federation admin over an unknown branch", []string{FederationAdmin("SE")}, Branch("nowhere"), false},

		{"branch admin over own branch", []string{BranchAdmin("karlstad")}, Branch("karlstad"), true},
		{"branch admin over a sibling branch", []string{BranchAdmin("karlstad")}, Branch("goteborg"), false},
		{"branch admin does not see upwards", []string{BranchAdmin("karlstad")}, Federation("SE"), false},
		{"branch admin is not a WSKO admin", []string{BranchAdmin("karlstad")}, WSKO(), false},

		{"no roles at all", nil, Branch("karlstad"), false},
		{"only unrecognised roles", []string{"wizard", "branch_admin"}, Branch("karlstad"), false},
		{"an unrecognised role alongside a real one", []string{"wizard", BranchAdmin("karlstad")}, Branch("karlstad"), true},
		{"several roles, one of which covers", []string{BranchAdmin("oslo"), FederationAdmin("SE")}, Branch("goteborg"), true},

		// A user with no branch yet — the window between Phase 1 and the
		// admission gate — is visible to nobody but a global admin.
		{"branchless user, federation admin", []string{FederationAdmin("SE")}, Branch(""), false},
		{"branchless user, branch admin", []string{BranchAdmin("karlstad")}, Branch(""), false},
		{"branchless user, global admin", []string{RoleAdmin}, Branch(""), true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := Covers(c.roles, c.want, tree); got != c.ok {
				t.Errorf("Covers(%v, %+v) = %t, want %t", c.roles, c.want, got, c.ok)
			}
		})
	}
}

// Without a tree a federation admin cannot tell which branches are theirs. The
// safe reading of that is to grant nothing, never to wave the caller through.
func TestCovers_NilResolverGrantsNothingExtra(t *testing.T) {
	if Covers([]string{FederationAdmin("SE")}, Branch("karlstad"), nil) {
		t.Error("a federation admin covered a branch with no tree to prove it by")
	}
	if !Covers([]string{FederationAdmin("SE")}, Federation("SE"), nil) {
		t.Error("a federation admin should still cover their own federation without a tree")
	}
	if !Covers([]string{RoleAdmin}, Branch("karlstad"), nil) {
		t.Error("a global admin needs no tree")
	}
}

// The rule that makes delegation work: you may grant a role whose scope you
// already cover. Stated here as a test because no code says it out loud — it is
// simply Covers applied to ScopeOf.
func TestCovers_GrantDelegatesDownwardsOnly(t *testing.T) {
	tree := fakeFederations{"karlstad": "SE"}
	mayGrant := func(caller []string, role string) bool {
		s, ok := ScopeOf(role)
		return ok && Covers(caller, s, tree)
	}

	fedAdmin := []string{FederationAdmin("SE")}
	if !mayGrant(fedAdmin, BranchAdmin("karlstad")) {
		t.Error("a federation admin should be able to appoint a branch admin inside their federation")
	}
	if !mayGrant(fedAdmin, FederationAdmin("SE")) {
		t.Error("a federation admin should be able to appoint a peer in their own federation")
	}
	if mayGrant(fedAdmin, RoleAdmin) {
		t.Error("a federation admin must not be able to mint a global admin")
	}
	if mayGrant(fedAdmin, RoleWSKOAdmin) {
		t.Error("a federation admin must not be able to mint a WSKO admin")
	}
	if mayGrant([]string{BranchAdmin("karlstad")}, FederationAdmin("SE")) {
		t.Error("a branch admin must not be able to promote anyone to their federation")
	}
	if !mayGrant([]string{RoleAdmin}, RoleWSKOAdmin) {
		t.Error("a global admin may grant anything")
	}
}
