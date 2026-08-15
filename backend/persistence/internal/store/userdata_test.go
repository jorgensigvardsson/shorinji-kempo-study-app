package store

import (
	"encoding/json"
	"errors"
	"testing"
)

// Splitting a document and putting it back together has to give back exactly what went
// in. Everything about writing to both stores rests on that: the old container stays
// authoritative precisely so this can be proven wrong cheaply, and once reads move
// across, any difference here is silent data loss.
func assertRoundTrip(t *testing.T, doc *Document) *Document {
	t.Helper()
	items, err := SplitDocument("user-1", doc)
	if err != nil {
		t.Fatalf("SplitDocument: %v", err)
	}
	back, err := AssembleDocument(items)
	if err != nil {
		t.Fatalf("AssembleDocument: %v", err)
	}
	if back.Version != doc.Version || back.UpdatedAt != doc.UpdatedAt || back.DeviceID != doc.DeviceID {
		t.Errorf("envelope changed: got %+v, want %+v", back, doc)
	}
	if back.SchemaVersion != doc.SchemaVersion || back.ClientCompat != doc.ClientCompat {
		t.Errorf("versions changed: schema %d/%d, compat %d/%d",
			back.SchemaVersion, doc.SchemaVersion, back.ClientCompat, doc.ClientCompat)
	}
	assertSameJSON(t, back.Data, doc.Data)
	return back
}

func assertSameJSON(t *testing.T, got, want json.RawMessage) {
	t.Helper()
	if len(got) == 0 && len(want) == 0 {
		return
	}
	var gotValue, wantValue any
	if err := json.Unmarshal(got, &gotValue); err != nil {
		t.Fatalf("unmarshal got %s: %v", got, err)
	}
	if err := json.Unmarshal(want, &wantValue); err != nil {
		t.Fatalf("unmarshal want %s: %v", want, err)
	}
	gotNorm, _ := json.Marshal(gotValue)
	wantNorm, _ := json.Marshal(wantValue)
	if string(gotNorm) != string(wantNorm) {
		t.Errorf("data changed:\n got %s\nwant %s", gotNorm, wantNorm)
	}
}

func fullDocument() *Document {
	return &Document{
		Version:       7,
		UpdatedAt:     "2026-08-15T12:00:00Z",
		DeviceID:      "device-abc",
		SchemaVersion: 1,
		ClientCompat:  2,
		Data: json.RawMessage(`{
			"grade":"nidan",
			"language":"sv",
			"notes":{"kote nage":"hold the elbow","uchi uke zuki":"line up the hips"},
			"hokeiRanks":{"kote nage":{"value":2,"updatedAt":"2026-08-01T00:00:00Z"}},
			"quizStreakHighScore":42,
			"currentWeekAnchor":null,
			"weeklyPlanCompletions":{"nidan|3":{"completedAt":"2026-08-02T00:00:00Z"}}
		}`),
	}
}

func TestSplitDocument_RoundTripsAFullDocument(t *testing.T) {
	assertRoundTrip(t, fullDocument())
}

// The split is structural, so a field the server has never heard of travels through it
// exactly like a known one. That is the property that keeps the two stores in step
// without the server being taught every schema change the client makes.
func TestSplitDocument_RoundTripsFieldsTheServerDoesNotKnow(t *testing.T) {
	doc := &Document{
		Version:   1,
		UpdatedAt: "2026-08-15T12:00:00Z",
		Data:      json.RawMessage(`{"grade":"shodan","somethingInventedLater":{"deep":{"nested":[1,2,3]}}}`),
	}
	back := assertRoundTrip(t, doc)

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(back.Data, &fields); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, ok := fields["somethingInventedLater"]; !ok {
		t.Error("the unknown field did not survive the split")
	}
}

func TestSplitDocument_RoundTripsAwkwardShapes(t *testing.T) {
	cases := map[string]json.RawMessage{
		"empty object":      json.RawMessage(`{}`),
		"null data":         json.RawMessage(`null`),
		"array data":        json.RawMessage(`[1,2,3]`),
		"string data":       json.RawMessage(`"just a string"`),
		"absent data":       nil,
		"empty-string key":  json.RawMessage(`{"":"blank key"}`),
		"key needing quote": json.RawMessage(`{"a\"b":1,"c\\d":2}`),
		"unicode key":       json.RawMessage(`{"före":"åäö","日本語":"かな"}`),
		"nested nulls":      json.RawMessage(`{"a":null,"b":{"c":null}}`),
	}
	for name, data := range cases {
		t.Run(name, func(t *testing.T) {
			assertRoundTrip(t, &Document{Version: 1, UpdatedAt: "2026-08-15T12:00:00Z", Data: data})
		})
	}
}

func TestSplitDocument_ProducesOneItemPerFieldPlusMeta(t *testing.T) {
	items, err := SplitDocument("user-1", fullDocument())
	if err != nil {
		t.Fatalf("SplitDocument: %v", err)
	}
	if items[0].ID != metaItemID {
		t.Errorf("first item is %q, want %q", items[0].ID, metaItemID)
	}
	if len(items) != 8 { // meta + 7 fields
		t.Errorf("got %d items, want 8", len(items))
	}
	for _, item := range items {
		if item.UserID != "user-1" {
			t.Errorf("item %q has userId %q — every item must share the partition key", item.ID, item.UserID)
		}
	}
}

func TestSplitDocument_IsDeterministic(t *testing.T) {
	first, _ := SplitDocument("user-1", fullDocument())
	second, _ := SplitDocument("user-1", fullDocument())
	if len(first) != len(second) {
		t.Fatalf("item counts differ: %d vs %d", len(first), len(second))
	}
	for i := range first {
		if first[i].ID != second[i].ID {
			t.Errorf("item %d: %q vs %q — splitting must be stable", i, first[i].ID, second[i].ID)
		}
	}
}

func TestAssembleDocument_RejectsItemsWithoutMeta(t *testing.T) {
	items := []UserDataItem{{ID: fieldItemID("grade"), UserID: "user-1", Value: json.RawMessage(`"nidan"`)}}
	if _, err := AssembleDocument(items); err == nil {
		t.Error("expected an error when the meta item is missing")
	}
}

func TestAssembleDocument_RejectsAMissingField(t *testing.T) {
	items, _ := SplitDocument("user-1", fullDocument())
	// Drop a field item but leave meta claiming it: a partial write, which must be
	// reported rather than quietly assembled into a document missing data.
	if _, err := AssembleDocument(items[:len(items)-1]); err == nil {
		t.Error("expected an error when meta names a field no item holds")
	}
}

// ─── FileUserDataStore ──────────────────────────────────────────────────────────

func TestFileUserDataStore_RoundTripsThroughStorage(t *testing.T) {
	s := NewFileUserDataStore(t.TempDir())
	doc := fullDocument()

	if _, err := s.SaveUnconditional("user-1", doc); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, _, err := s.Load("user-1")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got == nil {
		t.Fatal("Load returned nil")
	}
	assertSameJSON(t, got.Data, doc.Data)
	if got.DeviceID != doc.DeviceID || got.ClientCompat != doc.ClientCompat {
		t.Errorf("envelope changed: %+v", got)
	}
}

func TestFileUserDataStore_Load_Missing_ReturnsNil(t *testing.T) {
	s := NewFileUserDataStore(t.TempDir())
	got, _, err := s.Load("nobody")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got != nil {
		t.Errorf("got %+v, want nil", got)
	}
}

// A field removed from the document must not survive in the split store, or it would
// come back the next time the document is reassembled.
func TestFileUserDataStore_DroppedFieldDoesNotLingerAcrossSaves(t *testing.T) {
	s := NewFileUserDataStore(t.TempDir())

	if _, err := s.SaveUnconditional("user-1", &Document{Version: 1, Data: json.RawMessage(`{"a":1,"b":2}`)}); err != nil {
		t.Fatalf("first Save: %v", err)
	}
	if _, err := s.SaveUnconditional("user-1", &Document{Version: 2, Data: json.RawMessage(`{"a":1}`)}); err != nil {
		t.Fatalf("second Save: %v", err)
	}

	got, _, err := s.Load("user-1")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	assertSameJSON(t, got.Data, json.RawMessage(`{"a":1}`))
}

func TestFileUserDataStore_Delete_RemovesEverything(t *testing.T) {
	s := NewFileUserDataStore(t.TempDir())
	if _, err := s.SaveUnconditional("user-1", fullDocument()); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if err := s.Delete("user-1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	got, _, _ := s.Load("user-1")
	if got != nil {
		t.Errorf("got %+v after delete, want nil", got)
	}
}

func TestFileUserDataStore_Delete_Missing_IsNotAnError(t *testing.T) {
	if err := NewFileUserDataStore(t.TempDir()).Delete("nobody"); err != nil {
		t.Errorf("Delete: %v", err)
	}
}

// ─── concurrency ────────────────────────────────────────────────────────────────
//
// The split store needs its own optimistic concurrency before any read is served from
// it, or two devices can overwrite each other again exactly as they could before the
// ETag work. The meta item carries it: every write rewrites that item, so its version
// identifies the document as a whole.

func TestFileUserDataStore_Load_ReturnsAnETag(t *testing.T) {
	s := NewFileUserDataStore(t.TempDir())
	written, err := s.SaveUnconditional("user-1", fullDocument())
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if written == "" {
		t.Fatal("Save returned an empty ETag")
	}

	_, read, err := s.Load("user-1")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if read != written {
		t.Errorf("Load ETag %q, want the one Save returned, %q", read, written)
	}
}

func TestFileUserDataStore_Save_StaleETag_Rejected(t *testing.T) {
	s := NewFileUserDataStore(t.TempDir())

	first, err := s.Save("user-1", &Document{Version: 1, UpdatedAt: "t1", Data: json.RawMessage(`{"a":1}`)}, "")
	if err != nil {
		t.Fatalf("first Save: %v", err)
	}
	if _, err := s.Save("user-1", &Document{Version: 2, UpdatedAt: "t2", Data: json.RawMessage(`{"a":2}`)}, first); err != nil {
		t.Fatalf("second Save: %v", err)
	}

	// A third write holding the version the second one replaced.
	if _, err := s.Save("user-1", &Document{Version: 3, UpdatedAt: "t3", Data: json.RawMessage(`{"a":3}`)}, first); !errors.Is(err, ErrPreconditionFailed) {
		t.Fatalf("stale write: got %v, want ErrPreconditionFailed", err)
	}

	got, _, _ := s.Load("user-1")
	if got.Version != 2 {
		t.Errorf("stored version %d, want 2 — the stale write must not have landed", got.Version)
	}
}

func TestFileUserDataStore_Save_CreateWhenAlreadyExists_Rejected(t *testing.T) {
	s := NewFileUserDataStore(t.TempDir())
	if _, err := s.Save("user-1", &Document{Version: 1, UpdatedAt: "t1"}, ""); err != nil {
		t.Fatalf("first Save: %v", err)
	}
	if _, err := s.Save("user-1", &Document{Version: 99, UpdatedAt: "t2"}, ""); !errors.Is(err, ErrPreconditionFailed) {
		t.Fatalf("create over existing: got %v, want ErrPreconditionFailed", err)
	}
}

// Shadow writes and the backfill copy documents the authoritative store has already
// ordered, so they must not be subject to a second check that could reject a write
// which was never in conflict.
func TestFileUserDataStore_SaveUnconditional_IgnoresTheStoredVersion(t *testing.T) {
	s := NewFileUserDataStore(t.TempDir())
	if _, err := s.SaveUnconditional("user-1", &Document{Version: 1, UpdatedAt: "t1"}); err != nil {
		t.Fatalf("first: %v", err)
	}
	if _, err := s.SaveUnconditional("user-1", &Document{Version: 2, UpdatedAt: "t2"}); err != nil {
		t.Fatalf("second: %v", err)
	}
	got, _, _ := s.Load("user-1")
	if got.Version != 2 {
		t.Errorf("stored version %d, want 2", got.Version)
	}
}

// The ETag has to follow the document's content, not just the fact that a write
// happened, or a caller could hold one that no longer describes what is stored.
func TestFileUserDataStore_ETagChangesWithTheDocument(t *testing.T) {
	s := NewFileUserDataStore(t.TempDir())
	first, _ := s.SaveUnconditional("user-1", &Document{Version: 1, UpdatedAt: "t1", Data: json.RawMessage(`{"a":1}`)})
	second, _ := s.SaveUnconditional("user-1", &Document{Version: 1, UpdatedAt: "t2", Data: json.RawMessage(`{"a":1}`)})
	if first == second {
		t.Error("the ETag did not change when the document did")
	}

	// A new field changes the field list in meta, so the ETag must move too.
	third, _ := s.SaveUnconditional("user-1", &Document{Version: 1, UpdatedAt: "t2", Data: json.RawMessage(`{"a":1,"b":2}`)})
	if third == second {
		t.Error("the ETag did not change when a field was added")
	}
}
