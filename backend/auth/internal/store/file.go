package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// FileUserStore persists users as individual JSON files named by UUID.
// FindByLinkedIdentity performs a linear scan — acceptable for small user counts;
// a database index replaces this once Cosmos DB is wired in.
//
// Every read honours the `_ts`/`ttl` contract in filettl.go, so a document that
// has outlived its ttl is invisible here exactly as it would be in Cosmos, and
// is deleted on the spot — see the note on sweeping there. User records never
// carry a ttl; the stores that will (join requests) get the behaviour for free
// by living in the same package.
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
	if expired(data, time.Now()) {
		_ = os.Remove(s.path(id))
		return nil, nil
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
	now := time.Now()
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
//
// It is also the only path that visits every document, so it is where expired
// ones are reliably reclaimed rather than incidentally.
func (s *FileUserStore) List() ([]*User, error) {
	entries, err := os.ReadDir(s.baseDir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	now := time.Now()
	var users []*User
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
	// Stamp the write time the way Cosmos stamps `_ts`, so any ttl on the
	// document is measured from its most recent write.
	data, err = stampTimestamp(data, time.Now())
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
