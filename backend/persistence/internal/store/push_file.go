package store

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// FilePushStore persists each subscription as an individual JSON file under
// <baseDir>/push/<sha256(endpoint)>.json. The hash keeps the filename safe
// (endpoints are URLs) and makes endpoint-keyed upsert/delete trivial point ops.
type FilePushStore struct {
	dir string
}

func NewFilePushStore(baseDir string) *FilePushStore {
	return &FilePushStore{dir: filepath.Join(baseDir, "push")}
}

func endpointKey(endpoint string) string {
	sum := sha256.Sum256([]byte(endpoint))
	return hex.EncodeToString(sum[:])
}

func (s *FilePushStore) path(endpoint string) string {
	return filepath.Join(s.dir, endpointKey(endpoint)+".json")
}

func (s *FilePushStore) SaveSubscription(sub *PushSubscription) error {
	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(sub)
	if err != nil {
		return err
	}
	return os.WriteFile(s.path(sub.Endpoint), data, 0o644)
}

func (s *FilePushStore) DeleteSubscription(endpoint string) error {
	err := os.Remove(s.path(endpoint))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (s *FilePushStore) ListSubscriptions() ([]*PushSubscription, error) {
	entries, err := os.ReadDir(s.dir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	subs := make([]*PushSubscription, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(s.dir, e.Name()))
		if err != nil {
			return nil, err
		}
		var sub PushSubscription
		if err := json.Unmarshal(data, &sub); err != nil {
			return nil, err
		}
		subs = append(subs, &sub)
	}
	return subs, nil
}

// ListSubscriptionsForUsers is ListSubscriptions filtered to a set of user ids.
func (s *FilePushStore) ListSubscriptionsForUsers(userIDs []string) ([]*PushSubscription, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	wanted := make(map[string]bool, len(userIDs))
	for _, id := range userIDs {
		wanted[id] = true
	}
	all, err := s.ListSubscriptions()
	if err != nil {
		return nil, err
	}
	var subs []*PushSubscription
	for _, sub := range all {
		if wanted[sub.UserID] {
			subs = append(subs, sub)
		}
	}
	return subs, nil
}
