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
