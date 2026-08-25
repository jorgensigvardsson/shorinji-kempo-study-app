package store

import (
	"os"
	"path/filepath"
	"testing"
)

func writeRolesFile(t *testing.T, baseDir, content string) {
	t.Helper()
	dir := filepath.Join(baseDir, "roles")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "roles.json"), []byte(content), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
}

func TestFileRoleStore_ReturnsRolesCaseInsensitively(t *testing.T) {
	dir := t.TempDir()
	writeRolesFile(t, dir, `{"Admin@Example.com": ["admin", "editor"]}`)
	s := NewFileRoleStore(dir)

	roles, err := s.Roles("admin@example.COM")
	if err != nil {
		t.Fatalf("Roles: %v", err)
	}
	if len(roles) != 2 || roles[0] != "admin" {
		t.Fatalf("expected [admin editor], got %v", roles)
	}
}

func TestFileRoleStore_UnknownUser_Empty(t *testing.T) {
	dir := t.TempDir()
	writeRolesFile(t, dir, `{"admin@example.com": ["admin"]}`)
	s := NewFileRoleStore(dir)

	roles, err := s.Roles("nobody@example.com")
	if err != nil {
		t.Fatalf("Roles: %v", err)
	}
	if len(roles) != 0 {
		t.Errorf("expected no roles, got %v", roles)
	}
}

func TestFileRoleStore_NoFile_Empty(t *testing.T) {
	s := NewFileRoleStore(t.TempDir())
	roles, err := s.Roles("admin@example.com")
	if err != nil {
		t.Fatalf("Roles: %v", err)
	}
	if len(roles) != 0 {
		t.Errorf("expected no roles, got %v", roles)
	}
}

func TestFileRoleStore_SetRoles_RoundTrip(t *testing.T) {
	s := NewFileRoleStore(t.TempDir())

	if err := s.SetRoles("Admin@Example.com", []string{"admin"}); err != nil {
		t.Fatalf("SetRoles: %v", err)
	}
	roles, err := s.Roles("admin@example.com")
	if err != nil {
		t.Fatalf("Roles: %v", err)
	}
	if len(roles) != 1 || roles[0] != "admin" {
		t.Fatalf("expected [admin], got %v", roles)
	}
}

func TestFileRoleStore_SetRoles_EmptyRemovesEntry(t *testing.T) {
	dir := t.TempDir()
	writeRolesFile(t, dir, `{"admin@example.com": ["admin"], "other@example.com": ["editor"]}`)
	s := NewFileRoleStore(dir)

	if err := s.SetRoles("admin@example.com", nil); err != nil {
		t.Fatalf("SetRoles: %v", err)
	}
	if roles, _ := s.Roles("admin@example.com"); len(roles) != 0 {
		t.Fatalf("expected entry removed, got %v", roles)
	}
	// Unrelated entries are preserved.
	if roles, _ := s.Roles("other@example.com"); len(roles) != 1 || roles[0] != "editor" {
		t.Fatalf("expected other user's roles preserved, got %v", roles)
	}
}

func TestFileRoleStore_SetRoles_ReplacesCaseVariant(t *testing.T) {
	dir := t.TempDir()
	writeRolesFile(t, dir, `{"Admin@Example.com": ["admin"]}`)
	s := NewFileRoleStore(dir)

	if err := s.SetRoles("admin@example.com", []string{"admin", "editor"}); err != nil {
		t.Fatalf("SetRoles: %v", err)
	}
	roles, _ := s.Roles("ADMIN@example.com")
	if len(roles) != 2 {
		t.Fatalf("expected 2 roles after replacing case variant, got %v", roles)
	}
}

func TestFileRoleStore_ListAll(t *testing.T) {
	dir := t.TempDir()
	s := NewFileRoleStore(dir)

	if records, err := s.ListAll(); err != nil || len(records) != 0 {
		t.Fatalf("empty store: got %d records, err %v", len(records), err)
	}

	// One written through the API, one planted with awkward casing — the reverse
	// lookup must not miss an admin because somebody typed their address in caps.
	if err := s.SetRoles("branch@example.com", []string{"branch_admin:karlstad"}); err != nil {
		t.Fatalf("SetRoles: %v", err)
	}
	if err := s.SetRoles("Global@Example.COM", []string{"admin"}); err != nil {
		t.Fatalf("SetRoles: %v", err)
	}

	records, err := s.ListAll()
	if err != nil {
		t.Fatalf("ListAll: %v", err)
	}
	if len(records) != 2 {
		t.Fatalf("ListAll returned %d records, want 2", len(records))
	}

	byEmail := map[string][]string{}
	for _, r := range records {
		byEmail[r.ID] = r.Roles
	}
	if roles := byEmail["branch@example.com"]; len(roles) != 1 || roles[0] != "branch_admin:karlstad" {
		t.Errorf("branch admin roles = %v", roles)
	}
	if roles := byEmail["global@example.com"]; len(roles) != 1 || roles[0] != "admin" {
		t.Errorf("global admin roles = %v (was the key normalised?)", roles)
	}
}
