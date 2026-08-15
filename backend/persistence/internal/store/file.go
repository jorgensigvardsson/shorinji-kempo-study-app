package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

// FileStore persists documents as individual JSON files under a base directory.
// Each user's document lives at <baseDir>/<userID>.json.
//
// The ETag is a hash of the file's bytes, and the compare-and-write is guarded by a
// process-local mutex — enough for the single-process local and test setups this
// store is for. Two processes sharing a directory could still interleave; the Cosmos
// store is the one that runs in production.
type FileStore struct {
	baseDir string
	mu      sync.Mutex
}

func NewFileStore(baseDir string) *FileStore {
	return &FileStore{baseDir: baseDir}
}

func (s *FileStore) path(userID string) string {
	return filepath.Join(s.baseDir, userID+".json")
}

func (s *FileStore) Load(userID string) (*Document, string, error) {
	doc, etag, err := s.load(userID)
	if err != nil {
		return nil, "", err
	}
	return doc, etag, nil
}

func (s *FileStore) load(userID string) (*Document, string, error) {
	data, err := os.ReadFile(s.path(userID))
	if errors.Is(err, os.ErrNotExist) {
		return nil, "", nil
	}
	if err != nil {
		return nil, "", err
	}
	var doc Document
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, "", err
	}
	return &doc, etagOf(data), nil
}

func (s *FileStore) Save(userID string, doc *Document, ifMatch string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// An empty ifMatch asserts the document does not exist yet; any other value has
	// to name the version currently stored.
	_, current, err := s.load(userID)
	if err != nil {
		return "", err
	}
	if current != ifMatch {
		return "", ErrPreconditionFailed
	}

	return s.write(userID, doc)
}

func (s *FileStore) SaveUnconditional(userID string, doc *Document) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.write(userID, doc)
}

func (s *FileStore) write(userID string, doc *Document) (string, error) {
	if err := os.MkdirAll(s.baseDir, 0o755); err != nil {
		return "", err
	}
	data, err := json.Marshal(doc)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(s.path(userID), data, 0o644); err != nil {
		return "", err
	}
	return etagOf(data), nil
}

func (s *FileStore) Delete(userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	err := os.Remove(s.path(userID))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
