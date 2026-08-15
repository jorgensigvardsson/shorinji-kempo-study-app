package store

import (
	"encoding/json"
	"errors"
	"os"
	"sync"
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

	etag, err := s.Save("user-1", doc, "")
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if etag == "" {
		t.Error("Save returned an empty ETag")
	}

	got, gotETag, err := s.Load("user-1")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got == nil {
		t.Fatal("Load returned nil")
	}
	if got.Version != doc.Version || got.DeviceID != doc.DeviceID {
		t.Errorf("got %+v, want %+v", got, doc)
	}
	if gotETag != etag {
		t.Errorf("Load ETag %q, want the one Save returned, %q", gotETag, etag)
	}
}

func TestFileStore_Load_NotFound_ReturnsNil(t *testing.T) {
	s := NewFileStore(t.TempDir())
	got, etag, err := s.Load("nonexistent")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil, got %+v", got)
	}
	if etag != "" {
		t.Errorf("expected an empty ETag, got %q", etag)
	}
}

func TestFileStore_DifferentUserIDs_Isolated(t *testing.T) {
	dir := t.TempDir()
	s := NewFileStore(dir)

	docA := &Document{Version: 1, Data: json.RawMessage(`{"user":"A"}`)}
	docB := &Document{Version: 2, Data: json.RawMessage(`{"user":"B"}`)}

	if _, err := s.Save("user-A", docA, ""); err != nil {
		t.Fatalf("Save A: %v", err)
	}
	if _, err := s.Save("user-B", docB, ""); err != nil {
		t.Fatalf("Save B: %v", err)
	}

	gotA, _, _ := s.Load("user-A")
	gotB, _, _ := s.Load("user-B")

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

func TestFileStore_Save_StaleETag_Rejected(t *testing.T) {
	s := NewFileStore(t.TempDir())

	first, err := s.Save("user-1", &Document{Version: 1}, "")
	if err != nil {
		t.Fatalf("first Save: %v", err)
	}

	// A second device writes, holding the ETag the first device also holds.
	if _, err := s.Save("user-1", &Document{Version: 2}, first); err != nil {
		t.Fatalf("second Save: %v", err)
	}

	// The first device now writes against the version it read, which is stale.
	if _, err := s.Save("user-1", &Document{Version: 3}, first); !errors.Is(err, ErrPreconditionFailed) {
		t.Fatalf("stale write: got %v, want ErrPreconditionFailed", err)
	}

	got, _, _ := s.Load("user-1")
	if got.Version != 2 {
		t.Errorf("stored version %d, want 2 — the stale write must not have landed", got.Version)
	}
}

func TestFileStore_Save_CreateWhenAlreadyExists_Rejected(t *testing.T) {
	s := NewFileStore(t.TempDir())

	if _, err := s.Save("user-1", &Document{Version: 1}, ""); err != nil {
		t.Fatalf("first Save: %v", err)
	}

	// A second device believing it is creating the first document must not
	// overwrite the one that appeared while it was offline.
	if _, err := s.Save("user-1", &Document{Version: 99}, ""); !errors.Is(err, ErrPreconditionFailed) {
		t.Fatalf("create over existing: got %v, want ErrPreconditionFailed", err)
	}

	got, _, _ := s.Load("user-1")
	if got.Version != 1 {
		t.Errorf("stored version %d, want 1", got.Version)
	}
}

func TestFileStore_SaveUnconditional_OverwritesRegardless(t *testing.T) {
	s := NewFileStore(t.TempDir())

	if _, err := s.Save("user-1", &Document{Version: 1}, ""); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if _, err := s.SaveUnconditional("user-1", &Document{Version: 2}); err != nil {
		t.Fatalf("SaveUnconditional: %v", err)
	}

	got, _, _ := s.Load("user-1")
	if got.Version != 2 {
		t.Errorf("stored version %d, want 2", got.Version)
	}
}

// Concurrent writers all holding the same ETag: exactly one may win, or the check
// is not doing anything.
func TestFileStore_Save_ConcurrentWriters_OnlyOneWins(t *testing.T) {
	s := NewFileStore(t.TempDir())

	etag, err := s.Save("user-1", &Document{Version: 0}, "")
	if err != nil {
		t.Fatalf("seed Save: %v", err)
	}

	const writers = 8
	var wg sync.WaitGroup
	results := make([]error, writers)
	for i := range writers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, results[i] = s.Save("user-1", &Document{Version: i + 1}, etag)
		}()
	}
	wg.Wait()

	won := 0
	for i, err := range results {
		switch {
		case err == nil:
			won++
		case errors.Is(err, ErrPreconditionFailed):
		default:
			t.Errorf("writer %d: unexpected error %v", i, err)
		}
	}
	if won != 1 {
		t.Errorf("%d writers succeeded, want exactly 1", won)
	}
}
