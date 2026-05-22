package store

import (
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
)

// FileUserStore persists users as individual JSON files under a base directory.
// Each user is stored at <baseDir>/<url-escaped-id>.json.
// This is intentionally simple; a database replaces it once Cosmos DB is wired in.
type FileUserStore struct {
	baseDir string
}

func NewFileUserStore(baseDir string) *FileUserStore {
	return &FileUserStore{baseDir: baseDir}
}

func (s *FileUserStore) path(id string) string {
	return filepath.Join(s.baseDir, url.PathEscape(id)+".json")
}

func (s *FileUserStore) Find(id string) (*User, error) {
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
