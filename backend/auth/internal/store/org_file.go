package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// FileOrgStore persists organization nodes as JSON files under
// <baseDir>/organizations/<id>.json. This is the local-development fallback;
// production uses the Cosmos org store.
//
// The subdirectory is not decoration. FileUserStore.List scans its base
// directory for *.json and decodes each file into a User, and json.Unmarshal
// does not fail on a document with none of the right fields — so an org node
// sitting beside the users would become a phantom user with an empty ID. The
// role store keeps its distance for the same reason.
type FileOrgStore struct {
	baseDir string
}

func NewFileOrgStore(baseDir string) *FileOrgStore {
	return &FileOrgStore{baseDir: filepath.Join(baseDir, "organizations")}
}

func (s *FileOrgStore) path(id string) string {
	return filepath.Join(s.baseDir, id+".json")
}

func (s *FileOrgStore) Get(id string) (*OrgNode, error) {
	if !safeFileID(id) {
		return nil, nil
	}
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
	var n OrgNode
	if err := json.Unmarshal(data, &n); err != nil {
		return nil, err
	}
	return &n, nil
}

func (s *FileOrgStore) List() ([]*OrgNode, error) {
	entries, err := os.ReadDir(s.baseDir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil // an unseeded store is empty, not broken
	}
	if err != nil {
		return nil, err
	}
	now := time.Now()
	var nodes []*OrgNode
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
		var n OrgNode
		if err := json.Unmarshal(data, &n); err != nil {
			continue
		}
		nodes = append(nodes, &n)
	}
	return nodes, nil
}

func (s *FileOrgStore) Save(node *OrgNode) error {
	if !safeFileID(node.ID) {
		return errors.New("org node id is not usable as a filename")
	}
	if err := os.MkdirAll(s.baseDir, 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(node)
	if err != nil {
		return err
	}
	data, err = stampTimestamp(data, time.Now())
	if err != nil {
		return err
	}
	return os.WriteFile(s.path(node.ID), data, 0o644)
}

// safeFileID reports whether id can be used as a filename without escaping the
// store's own directory. Ids reach the stores directly from URL path values, and
// filepath.Join(dir, id+".json") resolves "../../secrets" as cheerfully as it
// resolves a UUID. Only a development store is exposed here — production is
// Cosmos, where an id is a key rather than a path — but a traversal is a
// traversal, and the guard costs one comparison.
//
// A separator is the only thing that can escape: ".." alone becomes "...json".
// The colon is refused because Windows reads "C:name" as a drive and "name:x"
// as an alternate data stream.
func safeFileID(id string) bool {
	return id != "" && !strings.ContainsAny(id, `/\:`)
}
