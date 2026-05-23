package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// FileRefreshTokenStore persists refresh tokens as JSON files under
// <baseDir>/refresh/<userID>/<tokenID>.json
// This layout lets DeleteByUserID remove an entire directory.
type FileRefreshTokenStore struct {
	baseDir string
}

func NewFileRefreshTokenStore(baseDir string) *FileRefreshTokenStore {
	return &FileRefreshTokenStore{baseDir: filepath.Join(baseDir, "refresh")}
}

func (s *FileRefreshTokenStore) path(userID, tokenID string) string {
	return filepath.Join(s.baseDir, userID, tokenID+".json")
}

func (s *FileRefreshTokenStore) Create(token *RefreshToken) error {
	dir := filepath.Join(s.baseDir, token.UserID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(token)
	if err != nil {
		return err
	}
	return os.WriteFile(s.path(token.UserID, token.ID), data, 0o644)
}

func (s *FileRefreshTokenStore) Find(tokenID string) (*RefreshToken, error) {
	userID, ok := UserIDFromTokenID(tokenID)
	if !ok {
		return nil, nil
	}
	data, err := os.ReadFile(s.path(userID, tokenID))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var t RefreshToken
	if err := json.Unmarshal(data, &t); err != nil {
		return nil, err
	}
	exp, err := time.Parse(time.RFC3339, t.ExpiresAt)
	if err != nil || time.Now().After(exp) {
		_ = s.Delete(tokenID) // clean up expired token
		return nil, nil
	}
	return &t, nil
}

func (s *FileRefreshTokenStore) Delete(tokenID string) error {
	userID, ok := UserIDFromTokenID(tokenID)
	if !ok {
		return nil
	}
	err := os.Remove(s.path(userID, tokenID))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (s *FileRefreshTokenStore) FindByFamilyID(userID, familyID string) (*RefreshToken, error) {
	dir := filepath.Join(s.baseDir, userID)
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		var t RefreshToken
		if err := json.Unmarshal(data, &t); err != nil {
			continue
		}
		if t.FamilyID != familyID {
			continue
		}
		exp, err := time.Parse(time.RFC3339, t.ExpiresAt)
		if err != nil || time.Now().After(exp) {
			continue
		}
		return &t, nil
	}
	return nil, nil
}

func (s *FileRefreshTokenStore) DeleteByUserID(userID string) error {
	dir := filepath.Join(s.baseDir, userID)
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".json") {
			_ = os.Remove(filepath.Join(dir, e.Name()))
		}
	}
	return os.Remove(dir) // best-effort; ignore if not empty
}
