package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"
)

func quiet(string, ...any) {}

func seedUsers(t *testing.T, s *FileStore, count int) {
	t.Helper()
	for i := range count {
		userID := fmt.Sprintf("user-%d", i)
		doc := &Document{
			Version:   1,
			UpdatedAt: fmt.Sprintf("2026-08-1%dT00:00:00Z", i%10),
			DeviceID:  userID,
			Data:      json.RawMessage(fmt.Sprintf(`{"grade":"shodan","seq":%d}`, i)),
		}
		if _, err := s.Save(userID, doc, ""); err != nil {
			t.Fatalf("seed %s: %v", userID, err)
		}
	}
}

func TestBackfill_CopiesEveryDocument(t *testing.T) {
	dir := t.TempDir()
	source := NewFileStore(dir)
	target := NewFileUserDataStore(dir)
	seedUsers(t, source, 5)

	result, err := BackfillUserData(source, target, quiet)
	if err != nil {
		t.Fatalf("BackfillUserData: %v", err)
	}
	if result.Total != 5 || result.Copied != 5 || result.Failed != 0 {
		t.Fatalf("got %+v, want 5 total / 5 copied / 0 failed", result)
	}

	for i := range 5 {
		userID := fmt.Sprintf("user-%d", i)
		got, err := target.Load(userID)
		if err != nil {
			t.Fatalf("Load %s: %v", userID, err)
		}
		if got == nil {
			t.Fatalf("%s was not copied", userID)
		}
		assertSameJSON(t, got.Data, json.RawMessage(fmt.Sprintf(`{"grade":"shodan","seq":%d}`, i)))
	}
}

// The split store writes its files into the same directory, and those must not be read
// back as if they were users.
func TestBackfill_DoesNotMistakeSplitFilesForUsers(t *testing.T) {
	dir := t.TempDir()
	source := NewFileStore(dir)
	target := NewFileUserDataStore(dir)
	seedUsers(t, source, 3)

	// First run creates the split files, second run must still see only three users.
	if _, err := BackfillUserData(source, target, quiet); err != nil {
		t.Fatalf("first run: %v", err)
	}
	result, err := BackfillUserData(source, target, quiet)
	if err != nil {
		t.Fatalf("second run: %v", err)
	}
	if result.Total != 3 {
		t.Errorf("total %d, want 3 — the split store's own files were counted as users", result.Total)
	}
}

// Re-running after a partial failure should cost reads, not rewrites.
func TestBackfill_IsIdempotent(t *testing.T) {
	dir := t.TempDir()
	source := NewFileStore(dir)
	target := NewFileUserDataStore(dir)
	seedUsers(t, source, 4)

	if _, err := BackfillUserData(source, target, quiet); err != nil {
		t.Fatalf("first run: %v", err)
	}
	result, err := BackfillUserData(source, target, quiet)
	if err != nil {
		t.Fatalf("second run: %v", err)
	}
	if result.Copied != 0 || result.AlreadyCurrent != 4 {
		t.Errorf("got %+v, want 0 copied / 4 already current", result)
	}
}

// A document that changed after being copied has to be copied again, or the backfill
// would report success while leaving the split store stale.
func TestBackfill_RecopiesAChangedDocument(t *testing.T) {
	dir := t.TempDir()
	source := NewFileStore(dir)
	target := NewFileUserDataStore(dir)
	seedUsers(t, source, 1)

	if _, err := BackfillUserData(source, target, quiet); err != nil {
		t.Fatalf("first run: %v", err)
	}

	_, etag, _ := source.Load("user-0")
	if _, err := source.Save("user-0", &Document{
		Version:   2,
		UpdatedAt: "2026-09-01T00:00:00Z",
		Data:      json.RawMessage(`{"grade":"nidan"}`),
	}, etag); err != nil {
		t.Fatalf("update: %v", err)
	}

	result, err := BackfillUserData(source, target, quiet)
	if err != nil {
		t.Fatalf("second run: %v", err)
	}
	if result.Copied != 1 {
		t.Errorf("copied %d, want 1", result.Copied)
	}
	got, _ := target.Load("user-0")
	assertSameJSON(t, got.Data, json.RawMessage(`{"grade":"nidan"}`))
}

// One unwritable document must not keep everyone else out of the new container.
type oneUserFailingStore struct {
	UserDataStore
	failFor string
}

func (s *oneUserFailingStore) Save(userID string, doc *Document) error {
	if userID == s.failFor {
		return errors.New("nope")
	}
	return s.UserDataStore.Save(userID, doc)
}

func TestBackfill_ContinuesPastAFailingUser(t *testing.T) {
	dir := t.TempDir()
	source := NewFileStore(dir)
	target := &oneUserFailingStore{UserDataStore: NewFileUserDataStore(dir), failFor: "user-2"}
	seedUsers(t, source, 5)

	result, err := BackfillUserData(source, target, quiet)
	if err != nil {
		t.Fatalf("BackfillUserData: %v", err)
	}
	if result.Copied != 4 || result.Failed != 1 {
		t.Errorf("got %+v, want 4 copied / 1 failed", result)
	}
	if len(result.Errors) != 1 {
		t.Errorf("errors %v, want one naming the failing user", result.Errors)
	}
}

func TestBackfill_EmptyStore(t *testing.T) {
	dir := t.TempDir()
	result, err := BackfillUserData(NewFileStore(dir), NewFileUserDataStore(dir), quiet)
	if err != nil {
		t.Fatalf("BackfillUserData: %v", err)
	}
	if result.Total != 0 || result.Copied != 0 {
		t.Errorf("got %+v, want an empty result", result)
	}
}

type unlistableStore struct{ Store }

func TestBackfill_StoreThatCannotEnumerate(t *testing.T) {
	_, err := BackfillUserData(unlistableStore{}, NewFileUserDataStore(t.TempDir()), quiet)
	if err == nil {
		t.Error("expected an error from a store that cannot list users")
	}
}

func TestFileStore_ListUserIDs_MissingDirectory(t *testing.T) {
	ids, err := NewFileStore(t.TempDir() + "/not-created-yet").ListUserIDs()
	if err != nil {
		t.Fatalf("ListUserIDs: %v", err)
	}
	if len(ids) != 0 {
		t.Errorf("got %v, want none", ids)
	}
}
