package store

import (
	"reflect"
	"sort"
	"testing"
)

func TestFileUserStore_List(t *testing.T) {
	s := NewFileUserStore(t.TempDir())

	if users, err := s.List(); err != nil || len(users) != 0 {
		t.Fatalf("empty store: got %d users, err %v", len(users), err)
	}

	for _, id := range []string{"u1", "u2", "u3"} {
		if err := s.Save(&User{ID: id, Email: id + "@example.com"}); err != nil {
			t.Fatalf("Save %s: %v", id, err)
		}
	}

	users, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(users) != 3 {
		t.Fatalf("expected 3 users, got %d", len(users))
	}
	seen := map[string]bool{}
	for _, u := range users {
		seen[u.ID] = true
	}
	for _, id := range []string{"u1", "u2", "u3"} {
		if !seen[id] {
			t.Errorf("missing user %s in list", id)
		}
	}
}

func TestFileUserStore_ListByBranches(t *testing.T) {
	s := NewFileUserStore(t.TempDir())
	for _, u := range []*User{
		{ID: "u1", Email: "u1@example.com", BranchID: "karlstad"},
		{ID: "u2", Email: "u2@example.com", BranchID: "karlstad"},
		{ID: "u3", Email: "u3@example.com", BranchID: "goteborg"},
		{ID: "u4", Email: "u4@example.com", BranchID: "oslo"},
		{ID: "u5", Email: "u5@example.com"}, // no branch at all
	} {
		if err := s.Save(u); err != nil {
			t.Fatalf("Save %s: %v", u.ID, err)
		}
	}

	got := func(t *testing.T, ids ...string) []string {
		t.Helper()
		users, err := s.ListByBranches(ids)
		if err != nil {
			t.Fatalf("ListByBranches(%v): %v", ids, err)
		}
		out := make([]string, 0, len(users))
		for _, u := range users {
			out = append(out, u.ID)
		}
		sort.Strings(out)
		return out
	}

	if ids := got(t, "karlstad"); !reflect.DeepEqual(ids, []string{"u1", "u2"}) {
		t.Errorf("one branch = %v, want [u1 u2]", ids)
	}
	if ids := got(t, "karlstad", "oslo"); !reflect.DeepEqual(ids, []string{"u1", "u2", "u4"}) {
		t.Errorf("two branches = %v, want [u1 u2 u4]", ids)
	}
	if ids := got(t, "nowhere"); len(ids) != 0 {
		t.Errorf("unknown branch = %v, want nothing", ids)
	}
	if ids := got(t); len(ids) != 0 {
		t.Errorf("no branches asked for = %v, want nothing", ids)
	}

	// The one that matters: a caller whose scope failed to resolve asks with an
	// empty id, and must not be handed the users who belong to no branch.
	if ids := got(t, ""); len(ids) != 0 {
		t.Errorf("empty branch id = %v, want nothing", ids)
	}
	if ids := got(t, "", "karlstad"); !reflect.DeepEqual(ids, []string{"u1", "u2"}) {
		t.Errorf("empty id alongside a real one = %v, want [u1 u2]", ids)
	}
	// And a branchless user is in the store, so the checks above mean something.
	if all, err := s.List(); err != nil || len(all) != 5 {
		t.Fatalf("List = %d users, %v; want the 5 that were saved", len(all), err)
	}
}
