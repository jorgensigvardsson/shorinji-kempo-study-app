package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestFileOrgStore_RoundTrip(t *testing.T) {
	s := NewFileOrgStore(t.TempDir())

	if nodes, err := s.List(); err != nil || len(nodes) != 0 {
		t.Fatalf("unseeded store: got %d nodes, err %v", len(nodes), err)
	}
	if n, err := s.Get("SE"); err != nil || n != nil {
		t.Fatalf("Get on empty store = %v, %v; want nil, nil", n, err)
	}

	se := &OrgNode{ID: "SE", Type: NodeFederation, Name: "Svenska Shorinji Kempoförbundet"}
	karlstad := &OrgNode{ID: "b-1", Type: NodeBranch, Name: "Shorinji Kempo Karlstad Branch", FederationID: "SE"}
	tokyo := &OrgNode{ID: "b-2", Type: NodeBranch, Name: "Shorinji Kempo Tokyo Branch"}
	for _, n := range []*OrgNode{se, karlstad, tokyo} {
		if err := s.Save(n); err != nil {
			t.Fatalf("Save %s: %v", n.ID, err)
		}
	}

	got, err := s.Get("SE")
	if err != nil || got == nil {
		t.Fatalf("Get(SE) = %v, %v", got, err)
	}
	if got.Name != se.Name || !got.IsFederation() {
		t.Errorf("Get(SE) = %+v, want the Swedish federation", got)
	}

	// A branch with no federation must read back with an empty FederationID
	// rather than something invented by the round trip — that emptiness is the
	// whole of "attached directly to WSKO".
	if got, err := s.Get("b-2"); err != nil || got == nil || got.FederationID != "" {
		t.Errorf("Get(b-2) = %v, %v; want a WSKO-attached branch", got, err)
	}

	nodes, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(nodes) != 3 {
		t.Fatalf("List returned %d nodes, want 3", len(nodes))
	}

	// Save is an upsert, not an append.
	se.Name = "Renamed"
	if err := s.Save(se); err != nil {
		t.Fatalf("Save (update): %v", err)
	}
	if nodes, _ := s.List(); len(nodes) != 3 {
		t.Errorf("after update, List returned %d nodes, want 3", len(nodes))
	}
	if got, _ := s.Get("SE"); got == nil || got.Name != "Renamed" {
		t.Errorf("update did not stick: %+v", got)
	}
}

// The reason the org store lives in a subdirectory: FileUserStore scans its own
// base directory for *.json and decodes whatever it finds into a User, without
// complaint. An org node beside the users would become a phantom member.
func TestFileOrgStore_IsInvisibleToTheUserStore(t *testing.T) {
	dir := t.TempDir()
	users := NewFileUserStore(dir)
	orgs := NewFileOrgStore(dir)

	if err := users.Save(&User{ID: "u1", Email: "u1@example.com"}); err != nil {
		t.Fatalf("Save user: %v", err)
	}
	if err := orgs.Save(&OrgNode{ID: "SE", Type: NodeFederation, Name: "Svenska Shorinji Kempoförbundet"}); err != nil {
		t.Fatalf("Save org: %v", err)
	}

	listed, err := users.List()
	if err != nil {
		t.Fatalf("List users: %v", err)
	}
	if len(listed) != 1 || listed[0].ID != "u1" {
		t.Errorf("the user listing picked up %d records, want only the real user", len(listed))
	}
	// And the reverse: the org store does not enumerate users.
	if nodes, _ := orgs.List(); len(nodes) != 1 || nodes[0].ID != "SE" {
		t.Errorf("the org listing picked up %d nodes, want only the federation", len(nodes))
	}
}

// Ids arrive from URL path values, and filepath.Join resolves "../.." as
// happily as it resolves a UUID.
func TestFileOrgStore_RefusesIDsThatEscapeItsDirectory(t *testing.T) {
	base := t.TempDir()
	s := NewFileOrgStore(base)

	secret := filepath.Join(base, "secret.json")
	if err := os.WriteFile(secret, []byte(`{"id":"secret","name":"not yours"}`), 0o644); err != nil {
		t.Fatalf("plant a file: %v", err)
	}

	for _, id := range []string{"../secret", `..\secret`, "sub/secret", "", "C:secret"} {
		if n, err := s.Get(id); err != nil || n != nil {
			t.Errorf("Get(%q) = %v, %v; want nil, nil", id, n, err)
		}
		if err := s.Save(&OrgNode{ID: id, Type: NodeFederation, Name: "x"}); err == nil {
			t.Errorf("Save(%q) was accepted; want a refusal", id)
		}
	}

	// The planted file is still exactly as it was.
	data, err := os.ReadFile(secret)
	if err != nil || string(data) != `{"id":"secret","name":"not yours"}` {
		t.Errorf("the file outside the store was touched: %q, %v", data, err)
	}
}

func TestFileOrgStore_StampsWriteTime(t *testing.T) {
	dir := t.TempDir()
	s := NewFileOrgStore(dir)
	if err := s.Save(&OrgNode{ID: "SE", Type: NodeFederation, Name: "Svenska Shorinji Kempoförbundet"}); err != nil {
		t.Fatalf("Save: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dir, "organizations", "SE.json"))
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	var meta ttlMeta
	if err := json.Unmarshal(data, &meta); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if meta.TS <= 0 {
		t.Error("saved node carries no _ts, so a ttl on it could never be measured")
	}
}

// The user store shares the guard, since its ids arrive from a URL path value
// the same way the org store's do.
func TestFileUserStore_RefusesIDsThatEscapeItsDirectory(t *testing.T) {
	base := t.TempDir()
	s := NewFileUserStore(filepath.Join(base, "users"))

	secret := filepath.Join(base, "secret.json")
	if err := os.WriteFile(secret, []byte(`{"id":"secret"}`), 0o644); err != nil {
		t.Fatalf("plant a file: %v", err)
	}

	for _, id := range []string{"../secret", `..\secret`, "sub/secret", ""} {
		if u, err := s.FindByID(id); err != nil || u != nil {
			t.Errorf("FindByID(%q) = %v, %v; want nil, nil", id, u, err)
		}
		if err := s.Save(&User{ID: id}); err == nil {
			t.Errorf("Save(%q) was accepted; want a refusal", id)
		}
		if err := s.Delete(id); err != nil {
			t.Errorf("Delete(%q) = %v; want a quiet refusal", id, err)
		}
	}
	if _, err := os.Stat(secret); err != nil {
		t.Errorf("the file outside the store was removed: %v", err)
	}
}
