package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStampTimestamp(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)

	got, err := stampTimestamp([]byte(`{"id":"u1","ttl":60}`), now)
	if err != nil {
		t.Fatalf("stampTimestamp: %v", err)
	}
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(got, &doc); err != nil {
		t.Fatalf("unmarshal stamped document: %v", err)
	}
	if string(doc["_ts"]) != "1700000000" {
		t.Errorf("_ts = %s, want 1700000000", doc["_ts"])
	}
	if string(doc["id"]) != `"u1"` || string(doc["ttl"]) != "60" {
		t.Errorf("other fields not preserved: %s", got)
	}

	// A second write re-stamps, so a ttl is always measured from the latest one.
	got, err = stampTimestamp(got, now.Add(time.Hour))
	if err != nil {
		t.Fatalf("re-stamp: %v", err)
	}
	if err := json.Unmarshal(got, &doc); err != nil {
		t.Fatalf("unmarshal re-stamped document: %v", err)
	}
	if string(doc["_ts"]) != "1700003600" {
		t.Errorf("re-stamped _ts = %s, want 1700003600", doc["_ts"])
	}
}

// Values are carried as raw JSON rather than decoded, so an integer too large
// for float64 survives a stamp intact. Decoding into map[string]any would round
// this to ...94 and silently corrupt whatever the field meant.
func TestStampTimestamp_PreservesLargeIntegers(t *testing.T) {
	got, err := stampTimestamp([]byte(`{"n":9007199254740993}`), time.Unix(1, 0))
	if err != nil {
		t.Fatalf("stampTimestamp: %v", err)
	}
	if !strings.Contains(string(got), "9007199254740993") {
		t.Errorf("large integer not preserved verbatim: %s", got)
	}
}

func TestStampTimestamp_RejectsNonObjects(t *testing.T) {
	for _, in := range []string{`null`, `[1,2]`, `"text"`, ``} {
		if _, err := stampTimestamp([]byte(in), time.Unix(1, 0)); err == nil {
			t.Errorf("stampTimestamp(%q): expected an error, got none", in)
		}
	}
}

func TestExpired(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	ago := func(d time.Duration) int64 { return now.Add(-d).Unix() }

	cases := []struct {
		name string
		doc  string
		want bool
	}{
		{"no ttl at all", `{"id":"u1","_ts":1699999000}`, false},
		{"ttl -1 means never, as in Cosmos", `{"ttl":-1,"_ts":1}`, false},
		{"ttl 0 means never", `{"ttl":0,"_ts":1}`, false},
		{"written just now", `{"ttl":60,"_ts":1700000000}`, false},
		{"one second short of the deadline", `{"ttl":60,"_ts":1699999941}`, false},
		{"exactly at the deadline", `{"ttl":60,"_ts":1699999940}`, true},
		{"long past the deadline", `{"ttl":60,"_ts":1699996400}`, true},
		{"ttl but no _ts is kept, not destroyed", `{"ttl":60}`, false},
		{"undecodable documents are somebody else's problem", `{oops`, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := expired([]byte(c.doc), now); got != c.want {
				t.Errorf("expired(%s) = %t, want %t", c.doc, got, c.want)
			}
		})
	}

	// The boundary above, expressed independently of hand-computed timestamps.
	if !expired([]byte(`{"ttl":30,"_ts":`+itoa(ago(30*time.Second))+`}`), now) {
		t.Error("a document whose ttl elapsed exactly now should be expired")
	}
}

func itoa(n int64) string {
	b, _ := json.Marshal(n)
	return string(b)
}

// The contract the join-request store will depend on: a document that has
// outlived its ttl is invisible through every read path, and each of those
// paths buries it on the way past.
func TestFileUserStore_ExpiredDocumentIsSweptOnRead(t *testing.T) {
	seed := func(t *testing.T) (*FileUserStore, string) {
		t.Helper()
		dir := t.TempDir()
		s := NewFileUserStore(dir)
		if err := s.Save(&User{ID: "live", Email: "live@example.com",
			LinkedIdentities: map[string]LinkedIdentity{"email": {Sub: "live@example.com"}}}); err != nil {
			t.Fatalf("Save: %v", err)
		}
		// Written by hand: a record stamped two hours ago with a one-hour ttl.
		stale := `{"id":"stale","email":"stale@example.com",` +
			`"linkedIdentities":{"email":{"sub":"stale@example.com"}},` +
			`"ttl":3600,"_ts":` + itoa(time.Now().Add(-2*time.Hour).Unix()) + `}`
		if err := os.WriteFile(filepath.Join(dir, "stale.json"), []byte(stale), 0o644); err != nil {
			t.Fatalf("write stale record: %v", err)
		}
		return s, dir
	}

	// Each read path gets its own store, so none of them can pass because
	// another already did the cleaning.
	//
	// FindByLinkedIdentity is asked for the stale record deliberately: it stops
	// at the first match, so it only buries what it passes on the way there.
	reads := map[string]func(*testing.T, *FileUserStore){
		"FindByID": func(t *testing.T, s *FileUserStore) {
			if u, err := s.FindByID("stale"); err != nil || u != nil {
				t.Errorf("FindByID(stale) = %v, %v; want nil, nil", u, err)
			}
		},
		"FindByLinkedIdentity": func(t *testing.T, s *FileUserStore) {
			if u, err := s.FindByLinkedIdentity("email", "stale@example.com"); err != nil || u != nil {
				t.Errorf("FindByLinkedIdentity(stale) = %v, %v; want nil, nil", u, err)
			}
		},
		"List": func(t *testing.T, s *FileUserStore) {
			users, err := s.List()
			if err != nil {
				t.Fatalf("List: %v", err)
			}
			if len(users) != 1 || users[0].ID != "live" {
				t.Errorf("List returned %d users, want only the live one", len(users))
			}
		},
	}

	for name, read := range reads {
		t.Run(name, func(t *testing.T) {
			s, dir := seed(t)
			read(t, s)

			if _, err := os.Stat(filepath.Join(dir, "stale.json")); !errors.Is(err, os.ErrNotExist) {
				t.Errorf("expired record should have been swept; stat err = %v", err)
			}
			// The live record is untouched by any of it.
			if _, err := os.Stat(filepath.Join(dir, "live.json")); err != nil {
				t.Errorf("live record should remain on disk: %v", err)
			}
			if u, err := s.FindByID("live"); err != nil || u == nil {
				t.Errorf("FindByID(live) = %v, %v; want the user", u, err)
			}
		})
	}
}

func TestFileUserStore_SaveStampsTimestamp(t *testing.T) {
	dir := t.TempDir()
	s := NewFileUserStore(dir)
	before := time.Now().Unix()
	if err := s.Save(&User{ID: "u1", Email: "u1@example.com"}); err != nil {
		t.Fatalf("Save: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dir, "u1.json"))
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	var meta ttlMeta
	if err := json.Unmarshal(data, &meta); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if meta.TS < before || meta.TS > time.Now().Unix() {
		t.Errorf("_ts = %d, want a stamp between %d and now", meta.TS, before)
	}

	// Stamping must not disturb the record itself.
	u, err := s.FindByID("u1")
	if err != nil || u == nil || u.Email != "u1@example.com" {
		t.Errorf("FindByID after Save = %v, %v", u, err)
	}
}
