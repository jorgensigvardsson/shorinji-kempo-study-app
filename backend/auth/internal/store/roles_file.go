package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// FileRoleStore reads role assignments from a single JSON file mapping
// email → roles, e.g. {"admin@example.com": ["admin"]}. It lives in its own
// subdirectory so the user store's *.json scan never picks it up.
//
// This is the local-dev fallback; production uses the Cosmos role store.
type FileRoleStore struct {
	path string
}

func NewFileRoleStore(baseDir string) *FileRoleStore {
	return &FileRoleStore{path: filepath.Join(baseDir, "roles", "roles.json")}
}

func (s *FileRoleStore) Roles(email string) ([]string, error) {
	id := NormalizeEmail(email)
	if id == "" {
		return nil, nil
	}
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
