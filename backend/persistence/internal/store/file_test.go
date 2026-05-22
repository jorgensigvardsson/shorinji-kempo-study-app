package store

import (
	"encoding/json"
	"os"
	"testing"
)

func TestFileStore_LoadSave_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	s := NewFileStore(dir)

	doc := &Document{
		Version:   3,
		UpdatedAt: "2026-05-22T12:00:00Z",
		DeviceID:  "device-abc",
		Data:      json.RawMessage(`{"foo":"bar"}`),
	}

	if err := s.Save("user-1", doc); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := s.Load("user-1")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got == nil {
		t.Fatal("Load returned nil")
	}
	if got.Version != doc.Version || got.DeviceID != doc.DeviceID {
		t.Errorf("got %+v, want %+v", got, doc)
	}
}

func TestFileStore_Load_NotFound_ReturnsNil(t *testing.T) {
	s := NewFileStore(t.TempDir())
	got, err := s.Load("nonexistent")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil, got %+v", got)
	}
}

func TestFileStore_DifferentUserIDs_Isolated(t *testing.T) {
	dir := t.TempDir()
	s := NewFileStore(dir)

	docA := &Document{Version: 1, Data: json.RawMessage(`{"user":"A"}`)}
	docB := &Document{Version: 2, Data: json.RawMessage(`{"user":"B"}`)}

	if err := s.Save("user-A", docA); err != nil {
		t.Fatalf("Save A: %v", err)
	}
	if err := s.Save("user-B", docB); err != nil {
		t.Fatalf("Save B: %v", err)
	}

	gotA, _ := s.Load("user-A")
	gotB, _ := s.Load("user-B")

	if gotA.Version != 1 {
		t.Errorf("user-A: expected version 1, got %d", gotA.Version)
	}
	if gotB.Version != 2 {
		t.Errorf("user-B: expected version 2, got %d", gotB.Version)
	}

	// Verify files exist on disk where expected
	if _, err := os.Stat(dir + "/user-A.json"); err != nil {
		t.Errorf("user-A file missing: %v", err)
	}
	if _, err := os.Stat(dir + "/user-B.json"); err != nil {
		t.Errorf("user-B file missing: %v", err)
	}
}
