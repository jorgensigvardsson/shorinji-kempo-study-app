package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

// FileUserDataStore keeps each user's items as one JSON file of items, for local
// development and tests.
//
// It stores the split rather than the assembled document on purpose: if it stored the
// document whole, the tests running against it would never exercise SplitDocument or
// AssembleDocument, and the split is the part that has to be right.
type FileUserDataStore struct {
	baseDir string
	mu      sync.Mutex
}

func NewFileUserDataStore(baseDir string) *FileUserDataStore {
	return &FileUserDataStore{baseDir: baseDir}
}

func (s *FileUserDataStore) path(userID string) string {
	return filepath.Join(s.baseDir, userID+".items.json")
}

func (s *FileUserDataStore) Save(userID string, doc *Document) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	items, err := SplitDocument(userID, doc)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(s.baseDir, 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(items)
	if err != nil {
		return err
	}
	return os.WriteFile(s.path(userID), data, 0o644)
}

func (s *FileUserDataStore) Load(userID string) (*Document, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.path(userID))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var items []UserDataItem
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}
	return AssembleDocument(items)
}

func (s *FileUserDataStore) Delete(userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	err := os.Remove(s.path(userID))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
