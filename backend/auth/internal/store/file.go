package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// FileUserStore persists users as individual JSON files named by UUID.
// FindByLinkedIdentity performs a linear scan — acceptable for small user counts;
// a database index replaces this once Cosmos DB is wired in.
type FileUserStore struct {
	baseDir string
}

func NewFileUserStore(baseDir string) *FileUserStore {
	return &FileUserStore{baseDir: baseDir}
}

func (s *FileUserStore) path(id string) string {
	return filepath.Join(s.baseDir, id+".json")
}

func (s *FileUserStore) FindByID(id string) (*User, error) {
	data, err := os.ReadFile(s.path(id))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var u User
	if err := json.Unmarshal(data, &u); err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *FileUserStore) FindByLinkedIdentity(providerName, sub string) (*User, error) {
	entries, err := os.ReadDir(s.baseDir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(s.baseDir, e.Name()))
		if err != nil {
			continue
		}
		var u User
		if err := json.Unmarshal(data, &u); err != nil {
			continue
		}
		if ident, ok := u.LinkedIdentities[providerName]; ok && ident.Sub == sub {
			return &u, nil
		}
	}
	return nil, nil
}

// List scans the base directory and returns every decoded user record. The
// roles store lives in a subdirectory and the signing key is not a top-level
// *.json file, so neither is picked up — the same scan profile as
// FindByLinkedIdentity.
func (s *FileUserStore) List() ([]*User, error) {
	entries, err := os.ReadDir(s.baseDir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var users []*User
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(s.baseDir, e.Name()))
		if err != nil {
			continue
		}
		var u User
		if err := json.Unmarshal(data, &u); err != nil {
			continue
		}
		users = append(users, &u)
	}
	return users, nil
}

func (s *FileUserStore) Save(user *User) error {
	if err := os.MkdirAll(s.baseDir, 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(user)
	if err != nil {
		return err
	}
	return os.WriteFile(s.path(user.ID), data, 0o644)
}

func (s *FileUserStore) Delete(id string) error {
	err := os.Remove(s.path(id))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
