package org

import (
	"errors"
	"reflect"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
)

type fakeStore struct {
	nodes   []*store.OrgNode
	listErr error
	saveErr error
}

func (f *fakeStore) List() ([]*store.OrgNode, error) {
	if f.listErr != nil {
		return nil, f.listErr
	}
	return f.nodes, nil
}

func (f *fakeStore) Get(id string) (*store.OrgNode, error) {
	for _, n := range f.nodes {
		if n.ID == id {
			return n, nil
		}
	}
	return nil, nil
}

func (f *fakeStore) Save(node *store.OrgNode) error {
	if f.saveErr != nil {
		return f.saveErr
	}
	for i, n := range f.nodes {
		if n.ID == node.ID {
			f.nodes[i] = node
			return nil
		}
	}
	f.nodes = append(f.nodes, node)
	return nil
}

func federation(id, name string) *store.OrgNode {
	return &store.OrgNode{ID: id, Type: store.NodeFederation, Name: name}
}

func branch(id, name, federationID string) *store.OrgNode {
	return &store.OrgNode{ID: id, Type: store.NodeBranch, Name: name, FederationID: federationID}
}

func seeded(t *testing.T) (*Tree, *fakeStore) {
	t.Helper()
	s := &fakeStore{nodes: []*store.OrgNode{
		federation("SE", "Svenska Shorinji Kempoförbundet"),
		federation("NO", "Norges Shorinji Kempo Forbund"),
		branch("karlstad", "Shorinji Kempo Karlstad Branch", "SE"),
		branch("goteborg", "Shorinji Kempo Göteborg Branch", "SE"),
		branch("oslo", "Shorinji Kempo Oslo Branch", "NO"),
		branch("tokyo", "Shorinji Kempo Tokyo Branch", ""), // straight to WSKO
	}}
	tree := New(s)
	if err := tree.Reload(); err != nil {
		t.Fatalf("Reload: %v", err)
	}
	return tree, s
}

func TestTree_Lookups(t *testing.T) {
	tree, _ := seeded(t)

	if n, ok := tree.Federation("SE"); !ok || n.Name != "Svenska Shorinji Kempoförbundet" {
		t.Errorf("Federation(SE) = %+v, %t", n, ok)
	}
	if n, ok := tree.Branch("karlstad"); !ok || n.FederationID != "SE" {
		t.Errorf("Branch(karlstad) = %+v, %t", n, ok)
	}

	// Asking for one kind by the other's id must not succeed, or a branch id in
	// a federation-shaped hole would quietly authorize the wrong scope.
	if _, ok := tree.Branch("SE"); ok {
		t.Error("Branch(SE) returned a federation")
	}
	if _, ok := tree.Federation("karlstad"); ok {
		t.Error("Federation(karlstad) returned a branch")
	}
	if _, ok := tree.Node("nowhere"); ok {
		t.Error("Node(nowhere) found something")
	}
}

func TestTree_FederationOf(t *testing.T) {
	tree, _ := seeded(t)

	cases := map[string]string{
		"karlstad": "SE",
		"oslo":     "NO",
		"tokyo":    "", // attached directly to WSKO
		"nowhere":  "", // unknown
		"SE":       "", // a federation is not in a federation
	}
	for id, want := range cases {
		if got := tree.FederationOf(id); got != want {
			t.Errorf("FederationOf(%q) = %q, want %q", id, got, want)
		}
	}
}

func TestTree_BranchesIn(t *testing.T) {
	tree, _ := seeded(t)

	if got, want := tree.BranchesIn("SE"), []string{"goteborg", "karlstad"}; !reflect.DeepEqual(got, want) {
		t.Errorf("BranchesIn(SE) = %v, want %v", got, want)
	}
	if got, want := tree.BranchesIn("NO"), []string{"oslo"}; !reflect.DeepEqual(got, want) {
		t.Errorf("BranchesIn(NO) = %v, want %v", got, want)
	}
	// "" asks the implicit root the same question.
	if got, want := tree.BranchesIn(""), []string{"tokyo"}; !reflect.DeepEqual(got, want) {
		t.Errorf("BranchesIn(WSKO) = %v, want %v", got, want)
	}
	if got := tree.BranchesIn("JP"); len(got) != 0 {
		t.Errorf("BranchesIn(JP) = %v, want nothing", got)
	}
}

// The snapshot is shared by every request goroutine, so nothing handed out of it
// may be a window back into it.
func TestTree_AccessorsReturnCopies(t *testing.T) {
	tree, _ := seeded(t)

	ids := tree.BranchesIn("SE")
	ids[0] = "clobbered"
	if got := tree.BranchesIn("SE"); got[0] == "clobbered" {
		t.Error("BranchesIn handed out its own slice")
	}

	n, _ := tree.Branch("karlstad")
	n.Name = "Renamed by a caller"
	if again, _ := tree.Branch("karlstad"); again.Name == "Renamed by a caller" {
		t.Error("Branch handed out a pointer into the snapshot")
	}
}

func TestTree_SaveWritesThroughAndRefreshes(t *testing.T) {
	tree, s := seeded(t)

	if err := tree.Save(branch("malmo", "Shorinji Kempo Malmö Branch", "SE")); err != nil {
		t.Fatalf("Save: %v", err)
	}
	// Visible immediately, without anyone remembering to reload.
	if _, ok := tree.Branch("malmo"); !ok {
		t.Error("a saved branch is not in the tree")
	}
	if got := tree.FederationOf("malmo"); got != "SE" {
		t.Errorf("FederationOf(malmo) = %q, want SE", got)
	}
	if len(s.nodes) != 7 {
		t.Errorf("store holds %d nodes, want 7", len(s.nodes))
	}

	// Moving a branch re-files it under the new federation and out of the old.
	if err := tree.Save(branch("malmo", "Shorinji Kempo Malmö Branch", "NO")); err != nil {
		t.Fatalf("Save (move): %v", err)
	}
	if got, want := tree.BranchesIn("NO"), []string{"malmo", "oslo"}; !reflect.DeepEqual(got, want) {
		t.Errorf("after move, BranchesIn(NO) = %v, want %v", got, want)
	}
	if got, want := tree.BranchesIn("SE"), []string{"goteborg", "karlstad"}; !reflect.DeepEqual(got, want) {
		t.Errorf("after move, BranchesIn(SE) = %v, want %v", got, want)
	}
}

func TestTree_SaveFailureLeavesTreeAlone(t *testing.T) {
	tree, s := seeded(t)
	s.saveErr = errors.New("store is down")

	if err := tree.Save(branch("malmo", "Shorinji Kempo Malmö Branch", "SE")); err == nil {
		t.Fatal("Save should have reported the store failure")
	}
	if _, ok := tree.Branch("malmo"); ok {
		t.Error("a branch that failed to persist appeared in the tree")
	}
}

// An empty tree silently strips every federation admin of their branches, so a
// failed refresh must not be allowed to produce one.
func TestTree_ReloadFailureKeepsPreviousSnapshot(t *testing.T) {
	tree, s := seeded(t)
	s.listErr = errors.New("store is down")

	if err := tree.Reload(); err == nil {
		t.Fatal("Reload should have reported the store failure")
	}
	if _, ok := tree.Branch("karlstad"); !ok {
		t.Error("the previous snapshot was lost on a failed reload")
	}
	if got := tree.FederationOf("karlstad"); got != "SE" {
		t.Errorf("FederationOf after failed reload = %q, want SE", got)
	}
}

func TestTree_ListingsAreOrderedByName(t *testing.T) {
	tree, _ := seeded(t)

	feds := tree.Federations()
	if len(feds) != 2 || feds[0].ID != "NO" || feds[1].ID != "SE" {
		t.Errorf("Federations() = %v, want Norges then Svenska", ids(feds))
	}
	branches := tree.Branches()
	if len(branches) != 4 {
		t.Fatalf("Branches() returned %d, want 4", len(branches))
	}
	for i := 1; i < len(branches); i++ {
		if branches[i-1].Name > branches[i].Name {
			t.Errorf("Branches() is not ordered by name: %v", ids(branches))
			break
		}
	}
}

func ids(nodes []store.OrgNode) []string {
	out := make([]string, len(nodes))
	for i, n := range nodes {
		out[i] = n.ID
	}
	return out
}

// The tree is the resolver authz asks about branch membership; if the two ever
// disagree about what "" means, every federation admin's reach changes silently.
func TestTree_SatisfiesFederationResolver(t *testing.T) {
	tree, _ := seeded(t)
	var resolver authz.FederationResolver = tree

	if !authz.Covers([]string{authz.FederationAdmin("SE")}, authz.Branch("karlstad"), resolver) {
		t.Error("the Swedish federation admin should cover Karlstad")
	}
	if authz.Covers([]string{authz.FederationAdmin("SE")}, authz.Branch("tokyo"), resolver) {
		t.Error("a WSKO-attached branch is nobody's federation business")
	}
}
