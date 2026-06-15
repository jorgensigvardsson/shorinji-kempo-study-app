package store

import "testing"

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
