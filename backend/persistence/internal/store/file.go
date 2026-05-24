package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// FileStore persists documents as individual JSON files under a base directory.
// Each user's document lives at <baseDir>/<userID>.json.
type FileStore struct {
	baseDir string
}

func NewFileStore(baseDir string) *FileStore {
	return &FileStore{baseDir: baseDir}
}

func (s *FileStore) path(userID string) string {
	return filepath.Join(s.baseDir, userID+".json")
}

func (s *FileStore) Load(userID string) (*Document, error) {
	data, err := os.ReadFile(s.path(userID))
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

func (s *FileStore) Save(userID string, doc *Document) error {
	if err := os.MkdirAll(s.baseDir, 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	return os.WriteFile(s.path(userID), data, 0o644)
}

func (s *FileStore) Delete(userID string) error {
	err := os.Remove(s.path(userID))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
