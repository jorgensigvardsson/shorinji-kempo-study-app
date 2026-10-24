package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// FileHistoryStore keeps usage history as JSON files under <baseDir>/history/,
// one per entry, for local development. The subdirectory keeps them out of the
// user store's *.json scan, as every other store here does.
type FileHistoryStore struct {
	baseDir string
	mu      sync.Mutex // makes the exists-check and the write in Append one step
	now     func() time.Time
}

func NewFileHistoryStore(baseDir string) *FileHistoryStore {
	return &FileHistoryStore{baseDir: filepath.Join(baseDir, "history"), now: time.Now}
}

// The ids are "week:2026-10-19" or a UUID; the colon is not a character every
// filesystem accepts.
func (s *FileHistoryStore) path(id string) string {
	return filepath.Join(s.baseDir, strings.ReplaceAll(id, ":", "_")+".json")
}

func (s *FileHistoryStore) Append(e *HistoryEntry) error {
	if e.ID == "" || strings.ContainsAny(e.ID, `/\.`) {
		return errors.New("history entry has no usable id")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(s.baseDir, 0o755); err != nil {
		return err
	}
	path := s.path(e.ID)
	if _, err := os.Stat(path); err == nil {
		return ErrHistoryExists
	}
	stored := *e
	stored.RecordedAt = s.now().UTC().Format(RecordedAtFormat)
	data, err := json.Marshal(stored)
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return err
	}
	e.RecordedAt = stored.RecordedAt
	return nil
}

func (s *FileHistoryStore) all() ([]*HistoryEntry, error) {
	entries, err := os.ReadDir(s.baseDir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []*HistoryEntry
	for _, d := range entries {
		if d.IsDir() || !strings.HasSuffix(d.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(s.baseDir, d.Name()))
		if err != nil {
			continue
		}
		var e HistoryEntry
		if err := json.Unmarshal(data, &e); err != nil {
			continue
		}
		out = append(out, &e)
	}
	return out, nil
}

func (s *FileHistoryStore) Since(recordedAt string) ([]*HistoryEntry, error) {
	all, err := s.all()
	if err != nil || recordedAt == "" {
		return all, err
	}
	cutoff, err := time.Parse(time.RFC3339, recordedAt)
	if err != nil {
		return nil, err
	}
	var out []*HistoryEntry
	for _, e := range all {
		if t, err := time.Parse(time.RFC3339, e.RecordedAt); err == nil && !t.Before(cutoff) {
			out = append(out, e)
		}
	}
	return out, nil
}

func (s *FileHistoryStore) LatestWeek() (string, error) {
	all, err := s.all()
	if err != nil {
		return "", err
	}
	latest := ""
	for _, e := range all {
		if e.Type == HistoryWeek && e.Week != nil && e.Week.Start > latest {
			latest = e.Week.Start
		}
	}
	return latest, nil
}
