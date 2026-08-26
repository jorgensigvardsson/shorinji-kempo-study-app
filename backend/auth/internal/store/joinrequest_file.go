package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// FileJoinRequestStore persists join requests as JSON files under
// <baseDir>/joinrequests/. The subdirectory keeps them out of the user store's
// *.json scan, for the reason spelled out in org_file.go: an unrelated document
// beside the users decodes into a phantom one without complaint.
//
// Filenames are the SHA-256 of the lowercased address rather than the address
// itself. An email is not a filename — it can hold characters a filesystem
// refuses, and it is the one field here that is worth not writing into a
// directory listing.
type FileJoinRequestStore struct {
	baseDir string
}

func NewFileJoinRequestStore(baseDir string) *FileJoinRequestStore {
	return &FileJoinRequestStore{baseDir: filepath.Join(baseDir, "joinrequests")}
}

func (s *FileJoinRequestStore) path(email string) string {
	return filepath.Join(s.baseDir, hashedFileName(NormalizeEmail(email))+".json")
}

func (s *FileJoinRequestStore) Get(email string) (*JoinRequest, error) {
	id := NormalizeEmail(email)
	if id == "" {
		return nil, nil
	}
	path := s.path(id)
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if expired(data, time.Now()) {
		_ = os.Remove(path)
		return nil, nil
	}
	var req JoinRequest
	if err := json.Unmarshal(data, &req); err != nil {
		return nil, err
	}
	return &req, nil
}

func (s *FileJoinRequestStore) Save(req *JoinRequest) error {
	id := NormalizeEmail(req.ID)
	if id == "" {
		return errors.New("join request has no address")
	}
	req.ID = id
	if err := os.MkdirAll(s.baseDir, 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(req)
	if err != nil {
		return err
	}
	// Stamp the write time so any ttl on the request is measured from it, the
	// way Cosmos measures from its own system timestamp.
	data, err = stampTimestamp(data, time.Now())
	if err != nil {
		return err
	}
	return os.WriteFile(s.path(id), data, 0o644)
}

func (s *FileJoinRequestStore) Delete(email string) error {
	id := NormalizeEmail(email)
	if id == "" {
		return nil
	}
	err := os.Remove(s.path(id))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (s *FileJoinRequestStore) List() ([]*JoinRequest, error) {
	entries, err := os.ReadDir(s.baseDir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	now := time.Now()
	var requests []*JoinRequest
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		path := filepath.Join(s.baseDir, e.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		if expired(data, now) {
			_ = os.Remove(path)
			continue
		}
		var req JoinRequest
		if err := json.Unmarshal(data, &req); err != nil {
			continue
		}
		requests = append(requests, &req)
	}
	return requests, nil
}
