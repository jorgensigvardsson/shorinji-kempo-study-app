package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// FileStore persists documents as JSON files under a base directory.
// Each document is stored at <baseDir>/<key>.json.
// This is intentionally simple; a database replaces it once auth is in place.
type FileStore struct {
	path string
}

func NewFileStore(baseDir, key string) *FileStore {
	return &FileStore{path: filepath.Join(baseDir, key+".json")}
}

func (s *FileStore) Load() (*Document, error) {
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var doc Document
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	return &doc, nil
}

func (s *FileStore) Save(doc *Document) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o644)
}
