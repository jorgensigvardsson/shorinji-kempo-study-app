package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

// backdate rewinds a stored document's _ts, so a ttl measured from the write can
// be reached without waiting for it — which is the point of the file store having
// a timestamp of its own rather than trusting the filesystem's.
func backdate(t *testing.T, path string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatalf("decode %s: %v", path, err)
	}
	doc["_ts"] = json.RawMessage(strconv.FormatInt(time.Now().Add(-time.Hour).Unix(), 10))
	out, err := json.Marshal(doc)
	if err != nil {
		t.Fatalf("encode %s: %v", path, err)
	}
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func TestFileTransferStore_RoundTripAndExpiry(t *testing.T) {
	dir := t.TempDir()
	s := NewFileTransferStore(dir)

	pending := &TransferRequest{ID: "member-1", FromBranchID: "karlstad", ToBranchID: "goteborg", Status: TransferPending}
	if err := s.Save(pending); err != nil {
		t.Fatalf("save: %v", err)
	}
	got, err := s.Get("member-1")
	if err != nil || got == nil || got.ToBranchID != "goteborg" {
		t.Fatalf("get = %+v, %v", got, err)
	}
	// A pending transfer carries no ttl and therefore waits as long as it takes.
	if got.TTL != 0 {
		t.Errorf("pending ttl = %d, want none", got.TTL)
	}

	// A refused one leaves on its own. The file store honours the same `ttl` the
	// Cosmos container does, measured from the write — which is the whole reason
	// it stamps `_ts` — so a rule that only fires months later is not a rule that
	// only works in production.
	refused := &TransferRequest{ID: "member-2", ToBranchID: "goteborg", Status: TransferRejected, TTL: 1}
	if err := s.Save(refused); err != nil {
		t.Fatalf("save refused: %v", err)
	}
	backdate(t, filepath.Join(dir, "transfers", "member-2.json"))
	if got, err := s.Get("member-2"); err != nil || got != nil {
		t.Errorf("expired transfer came back: %+v, %v", got, err)
	}
	// And it is swept rather than merely hidden.
	if _, err := os.Stat(filepath.Join(dir, "transfers", "member-2.json")); !os.IsNotExist(err) {
		t.Errorf("expired transfer still on disk: %v", err)
	}

	if list, err := s.List(); err != nil || len(list) != 1 || list[0].ID != "member-1" {
		t.Errorf("list = %+v, %v, want only the pending one", list, err)
	}

	if err := s.Delete("member-1"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if got, _ := s.Get("member-1"); got != nil {
		t.Errorf("deleted transfer came back: %+v", got)
	}
	// Deleting what is not there is not an error: withdrawing a request nobody
	// recorded should look the same as withdrawing one that existed.
	if err := s.Delete("member-1"); err != nil {
		t.Errorf("second delete: %v", err)
	}
}

// The id reaches this store from a URL path on the admin side, so it is checked
// before it becomes a filename. An encoded separator survives ServeMux.
func TestFileTransferStore_RefusesTraversal(t *testing.T) {
	s := NewFileTransferStore(t.TempDir())
	for _, id := range []string{"../escape", `..\escape`, "C:secret", ""} {
		if err := s.Save(&TransferRequest{ID: id, Status: TransferPending}); err == nil {
			t.Errorf("saved a transfer with id %q", id)
		}
		if got, err := s.Get(id); got != nil || err != nil {
			t.Errorf("get %q = %+v, %v", id, got, err)
		}
	}
}
