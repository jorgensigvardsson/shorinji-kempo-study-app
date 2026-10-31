package usage

import (
	"context"
	"testing"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
)

type countingStats struct{ asked []time.Time }

func (c *countingStats) WeekStats(_ context.Context, start, _ time.Time) (*WeekStats, error) {
	c.asked = append(c.asked, start)
	return &WeekStats{People: 3, ByBranch: map[string]int{"karlstad": 3}, Hours: 9,
		ByMode: map[string]int{"standalone": 2, "browser": 1}, ByVersion: map[string]int{"abc": 3}}, nil
}

func newJob(t *testing.T, now time.Time) (SnapshotJob, *countingStats, store.HistoryStore) {
	t.Helper()
	stats := &countingStats{}
	history := store.NewFileHistoryStore(t.TempDir())
	return SnapshotJob{
		Stats:     stats,
		History:   history,
		Members:   func() (map[string]int, error) { return map[string]int{"karlstad": 12}, nil },
		Now:       func() time.Time { return now },
		Retention: 30 * 24 * time.Hour,
		Settle:    6 * time.Hour,
	}, stats, history
}

// Monday 2026-10-26, 08:00: the week of the 19th is finished and settled.
var mondayMorning = time.Date(2026, 10, 26, 8, 0, 0, 0, time.UTC)

func TestSnapshot_FirstRunStoresEveryWholeWeekTelemetryStillHolds(t *testing.T) {
	job, stats, history := newJob(t, mondayMorning)

	result, err := job.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	// 30 days back is Saturday 2026-09-26; the first whole week after it starts
	// Monday the 28th. Weeks of 28/9, 5/10, 12/10 and 19/10 are finished.
	want := []string{"2026-09-28T00:00:00Z", "2026-10-05T00:00:00Z", "2026-10-12T00:00:00Z", "2026-10-19T00:00:00Z"}
	if len(result.Stored) != len(want) {
		t.Fatalf("stored %v, want %v", result.Stored, want)
	}
	for i := range want {
		if result.Stored[i] != want[i] {
			t.Errorf("stored[%d] = %s, want %s", i, result.Stored[i], want[i])
		}
	}
	if len(stats.asked) != 4 {
		t.Errorf("asked Azure %d times, want 4", len(stats.asked))
	}

	entries, _ := history.Since("")
	if len(entries) != 4 {
		t.Fatalf("history holds %d entries", len(entries))
	}
	for _, e := range entries {
		if e.Type != store.HistoryWeek || e.ID != store.WeekID(e.Week.Start) || e.Week.Members["karlstad"] != 12 || e.Week.People != 3 {
			t.Errorf("entry = %+v %+v", e, e.Week)
		}
	}
}

func TestSnapshot_RunsAgainAndFindsNothingToDo(t *testing.T) {
	job, stats, _ := newJob(t, mondayMorning)
	if _, err := job.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	stats.asked = nil

	result, err := job.Run(context.Background())
	if err != nil || len(result.Stored) != 0 || len(stats.asked) != 0 {
		t.Errorf("second run stored %v and asked %d times (%v); want nothing", result.Stored, len(stats.asked), err)
	}
}

// Not dependent on cadence: three missed weeks are caught up by the next run.
func TestSnapshot_CatchesUpAfterMissedRuns(t *testing.T) {
	job, _, history := newJob(t, mondayMorning)
	if _, err := job.Run(context.Background()); err != nil {
		t.Fatal(err)
	}

	later := mondayMorning.AddDate(0, 0, 21)
	job.Now = func() time.Time { return later }
	result, err := job.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Stored) != 3 || result.Stored[0] != "2026-10-26T00:00:00Z" || len(result.Lost) != 0 {
		t.Errorf("caught up %v, lost %v; want the three weeks since, none lost", result.Stored, result.Lost)
	}
	if latest, _ := history.LatestWeek(); latest != "2026-11-09T00:00:00Z" {
		t.Errorf("latest = %s", latest)
	}
}

// Missed for longer than telemetry is kept: the weeks in between cannot be
// counted whole, so they are reported lost rather than stored short.
func TestSnapshot_ReportsWeeksBeyondRetentionAsLost(t *testing.T) {
	job, _, _ := newJob(t, mondayMorning)
	if _, err := job.Run(context.Background()); err != nil {
		t.Fatal(err)
	}

	muchLater := mondayMorning.AddDate(0, 0, 56)
	job.Now = func() time.Time { return muchLater }
	result, err := job.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Lost) == 0 {
		t.Fatal("no weeks reported lost after eight weeks away")
	}
	for _, lost := range result.Lost {
		for _, stored := range result.Stored {
			if lost == stored {
				t.Errorf("%s both lost and stored", lost)
			}
		}
	}
	if result.Stored[0] != mondayOnOrAfter(muchLater.Add(-job.Retention)).Format(time.RFC3339) {
		t.Errorf("resumed at %s, want the first week telemetry still holds", result.Stored[0])
	}
}

// The week that has just ended is left until its last events have arrived.
func TestSnapshot_WaitsForTheWeekToSettle(t *testing.T) {
	job, _, _ := newJob(t, time.Date(2026, 10, 26, 2, 0, 0, 0, time.UTC))

	result, err := job.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if last := result.Stored[len(result.Stored)-1]; last != "2026-10-12T00:00:00Z" {
		t.Errorf("last stored %s; the week of the 19th ended two hours ago and should wait", last)
	}
}

func TestMondayOnOrAfter(t *testing.T) {
	for in, want := range map[string]string{
		"2026-10-19T00:00:00Z": "2026-10-19T00:00:00Z", // a Monday midnight is its own
		"2026-10-19T00:00:01Z": "2026-10-26T00:00:00Z", // a moment later, the next
		"2026-10-24T15:00:00Z": "2026-10-26T00:00:00Z",
		"2026-10-25T23:59:59Z": "2026-10-26T00:00:00Z",
	} {
		at, _ := time.Parse(time.RFC3339, in)
		if got := mondayOnOrAfter(at).Format(time.RFC3339); got != want {
			t.Errorf("mondayOnOrAfter(%s) = %s, want %s", in, got, want)
		}
	}
}
