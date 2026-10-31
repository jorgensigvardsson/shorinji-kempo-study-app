package store

import (
	"errors"
	"testing"
	"time"
)

func TestFileHistoryStore_AppendNeverOverwrites(t *testing.T) {
	s := NewFileHistoryStore(t.TempDir())
	week := &HistoryEntry{ID: WeekID("2026-10-19T00:00:00Z"), Type: HistoryWeek, Week: &WeekSnapshot{Start: "2026-10-19T00:00:00Z", People: 4}}

	if err := s.Append(week); err != nil {
		t.Fatalf("first append: %v", err)
	}
	again := &HistoryEntry{ID: week.ID, Type: HistoryWeek, Week: &WeekSnapshot{Start: "2026-10-19T00:00:00Z", People: 99}}
	if err := s.Append(again); !errors.Is(err, ErrHistoryExists) {
		t.Fatalf("second append: err = %v, want ErrHistoryExists", err)
	}

	all, err := s.Since("")
	if err != nil || len(all) != 1 || all[0].Week.People != 4 {
		t.Fatalf("Since = %+v, %v; want the first write, untouched", all, err)
	}
}

func TestFileHistoryStore_SinceIsInclusiveAndStampsRecordedAt(t *testing.T) {
	s := NewFileHistoryStore(t.TempDir())
	clock := time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)
	s.now = func() time.Time { return clock }

	first := &HistoryEntry{ID: "a", Type: HistoryAccountCreated, Branch: "karlstad"}
	if err := s.Append(first); err != nil {
		t.Fatal(err)
	}
	if first.RecordedAt != "2026-10-24T12:00:00.000000Z" {
		t.Errorf("RecordedAt = %q, want the fixed-width stamp", first.RecordedAt)
	}
	clock = clock.Add(time.Hour)
	if err := s.Append(&HistoryEntry{ID: "b", Type: HistoryAccountDeleted}); err != nil {
		t.Fatal(err)
	}

	got, err := s.Since(first.RecordedAt)
	if err != nil || len(got) != 2 {
		t.Fatalf("Since(first) = %d entries, %v; want both, the cursor being inclusive", len(got), err)
	}
	got, _ = s.Since("2026-10-24T12:30:00.000000Z")
	if len(got) != 1 || got[0].ID != "b" {
		t.Errorf("Since(12:30) = %+v, want only b", got)
	}
}

func TestFileHistoryStore_LatestWeek(t *testing.T) {
	s := NewFileHistoryStore(t.TempDir())
	if latest, err := s.LatestWeek(); err != nil || latest != "" {
		t.Fatalf("empty store: %q, %v", latest, err)
	}
	for _, start := range []string{"2026-10-05T00:00:00Z", "2026-10-19T00:00:00Z", "2026-10-12T00:00:00Z"} {
		if err := s.Append(&HistoryEntry{ID: WeekID(start), Type: HistoryWeek, Week: &WeekSnapshot{Start: start}}); err != nil {
			t.Fatal(err)
		}
	}
	if latest, _ := s.LatestWeek(); latest != "2026-10-19T00:00:00Z" {
		t.Errorf("LatestWeek = %q", latest)
	}
}
