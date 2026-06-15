package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

// FileRoleStore reads role assignments from a single JSON file mapping
// email → roles, e.g. {"admin@example.com": ["admin"]}. It lives in its own
// subdirectory so the user store's *.json scan never picks it up.
//
// This is the local-dev fallback; production uses the Cosmos role store.
type FileRoleStore struct {
	path string
	mu   sync.Mutex // serialises read-modify-write in SetRoles
}

func NewFileRoleStore(baseDir string) *FileRoleStore {
	return &FileRoleStore{path: filepath.Join(baseDir, "roles", "roles.json")}
}

func (s *FileRoleStore) Roles(email string) ([]string, error) {
	id := NormalizeEmail(email)
	if id == "" {
		return nil, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var m map[string][]string
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	// Match case-insensitively on email.
	for k, roles := range m {
		if NormalizeEmail(k) == id {
			return roles, nil
		}
	}
	return nil, nil
}

// SetRoles replaces the roles for email in the JSON file. An empty roles slice
// removes the entry. The whole map is rewritten under a lock so concurrent
// updates can't clobber each other.
func (s *FileRoleStore) SetRoles(email string, roles []string) error {
	id := NormalizeEmail(email)
	if id == "" {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	m := map[string][]string{}
	data, err := os.ReadFile(s.path)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err == nil {
		if err := json.Unmarshal(data, &m); err != nil {
			return err
		}
	}

	// Drop any existing entry that matches case-insensitively, then re-add under
	// the normalized key so casing variants don't accumulate.
	for k := range m {
		if NormalizeEmail(k) == id {
			delete(m, k)
		}
	}
	if len(roles) > 0 {
		m[id] = roles
	}

	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	out, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, out, 0o644)
}
