package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// FileTransferStore persists transfer requests as JSON files under
// <baseDir>/transfers/. The subdirectory keeps them out of the user store's
// *.json scan, for the reason spelled out in org_file.go: an unrelated document
// beside the users decodes into a phantom one without complaint.
//
// The id is a user's UUID rather than an address, so it is used as the filename
// directly — but it still arrives from a URL path on the admin side, so it is
// checked for separators before it becomes a path.
type FileTransferStore struct {
	baseDir string
}

func NewFileTransferStore(baseDir string) *FileTransferStore {
	return &FileTransferStore{baseDir: filepath.Join(baseDir, "transfers")}
}

func (s *FileTransferStore) path(userID string) string {
	return filepath.Join(s.baseDir, userID+".json")
}

func (s *FileTransferStore) Get(userID string) (*TransferRequest, error) {
	if !safeFileID(userID) {
		return nil, nil
	}
	path := s.path(userID)
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
	var req TransferRequest
	if err := json.Unmarshal(data, &req); err != nil {
		return nil, err
	}
	return &req, nil
}

func (s *FileTransferStore) Save(req *TransferRequest) error {
	if !safeFileID(req.ID) {
		return errors.New("transfer request has no usable member id")
	}
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
	return os.WriteFile(s.path(req.ID), data, 0o644)
}

func (s *FileTransferStore) Delete(userID string) error {
	if !safeFileID(userID) {
		return nil
	}
	err := os.Remove(s.path(userID))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (s *FileTransferStore) List() ([]*TransferRequest, error) {
	entries, err := os.ReadDir(s.baseDir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	now := time.Now()
	var requests []*TransferRequest
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
		var req TransferRequest
		if err := json.Unmarshal(data, &req); err != nil {
			continue
		}
		requests = append(requests, &req)
	}
	return requests, nil
}
