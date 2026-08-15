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

// userDataFileSuffix is shared with FileStore.ListUserIDs, which lives in the same
// directory and has to skip these rather than read them back as users.
const userDataFileSuffix = ".items.json"

func (s *FileUserDataStore) path(userID string) string {
	return filepath.Join(s.baseDir, userID+userDataFileSuffix)
}

func (s *FileUserDataStore) Save(userID string, doc *Document, ifMatch string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// An empty ifMatch asserts nothing is stored yet; any other value has to name the
	// version currently stored. Mirrors FileStore, and is likewise good enough for the
	// single-process setups this store is for.
	_, current, err := s.load(userID)
	if err != nil {
		return "", err
	}
	if current != ifMatch {
		return "", ErrPreconditionFailed
	}
	return s.write(userID, doc)
}

func (s *FileUserDataStore) SaveUnconditional(userID string, doc *Document) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.write(userID, doc)
}

func (s *FileUserDataStore) write(userID string, doc *Document) (string, error) {
	items, err := SplitDocument(userID, doc)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(s.baseDir, 0o755); err != nil {
		return "", err
	}
	data, err := json.Marshal(items)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(s.path(userID), data, 0o644); err != nil {
		return "", err
	}
	return etagOf(items[0].Value), nil
}

func (s *FileUserDataStore) Load(userID string) (*Document, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.load(userID)
}

// The ETag is derived from the meta item alone, matching Cosmos, where the meta item's
// own ETag is what guards a write. Every write rewrites meta, so it identifies the
// document as a whole.
func (s *FileUserDataStore) load(userID string) (*Document, string, error) {
	data, err := os.ReadFile(s.path(userID))
	if errors.Is(err, os.ErrNotExist) {
		return nil, "", nil
	}
	if err != nil {
		return nil, "", err
	}
	var items []UserDataItem
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, "", err
	}
	doc, err := AssembleDocument(items)
	if err != nil {
		return nil, "", err
	}
	for _, item := range items {
		if item.ID == metaItemID {
			return doc, etagOf(item.Value), nil
		}
	}
	return nil, "", errors.New("no meta item in stored user data")
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
