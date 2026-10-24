package usage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
)

// SnapshotJob stores every finished week that is not stored yet.
//
// Weeks rather than "since the last run": distinct people only mean something
// over a fixed span, so each snapshot is one whole Monday-to-Sunday week, counted
// once. Where the job got to is read back from the history itself — the newest
// stored week — so there is no separate cursor to keep, and the container stays
// strictly append-only. A missed run is caught up by the next; a run twice in a
// week finds nothing to do; two at once collide on the week's deterministic id
// and the loser stores nothing.
type SnapshotJob struct {
	Stats   WeekStatser
	History store.HistoryStore
	// Members counts accounts per branch, now. Asked at most once a run.
	Members func() (map[string]int, error)
	Now     func() time.Time

	// Retention is how far back telemetry reaches. A week that began before it
	// can no longer be counted whole, so it is skipped rather than stored short.
	Retention time.Duration
	// Settle is how long after a week ends before it is counted, so the last
	// events of Sunday night have been ingested.
	Settle time.Duration
}

// SnapshotResult says what a run did: the weeks it stored, and any it found
// already beyond telemetry's reach — lost to runs that did not happen in time.
type SnapshotResult struct {
	Stored []string
	Lost   []string
}

const week = 7 * 24 * time.Hour

func (j SnapshotJob) Run(ctx context.Context) (*SnapshotResult, error) {
	now := j.Now().UTC()
	result := &SnapshotResult{}

	// The first week telemetry still holds whole.
	earliest := mondayOnOrAfter(now.Add(-j.Retention))

	start := earliest
	latest, err := j.History.LatestWeek()
	if err != nil {
		return nil, fmt.Errorf("snapshot: latest stored week: %w", err)
	}
	if latest != "" {
		last, err := time.Parse(time.RFC3339, latest)
		if err != nil {
			return nil, fmt.Errorf("snapshot: stored week %q: %w", latest, err)
		}
		next := last.Add(week)
		for ; next.Before(earliest); next = next.Add(week) {
			result.Lost = append(result.Lost, next.Format(time.RFC3339))
		}
		start = next
	}

	var members map[string]int
	for ; !start.Add(week + j.Settle).After(now); start = start.Add(week) {
		end := start.Add(week)
		stats, err := j.Stats.WeekStats(ctx, start, end)
		if err != nil {
			return result, fmt.Errorf("snapshot: week of %s: %w", start.Format("2006-01-02"), err)
		}
		if members == nil {
			if members, err = j.Members(); err != nil {
				return result, fmt.Errorf("snapshot: count members: %w", err)
			}
		}
		startText := start.Format(time.RFC3339)
		err = j.History.Append(&store.HistoryEntry{
			ID:   store.WeekID(startText),
			Type: store.HistoryWeek,
			At:   end.Format(time.RFC3339),
			Week: &store.WeekSnapshot{
				Start:     startText,
				People:    stats.People,
				ByBranch:  stats.ByBranch,
				Hours:     stats.Hours,
				ByMode:    stats.ByMode,
				ByVersion: stats.ByVersion,
				Members:   members,
			},
		})
		if errors.Is(err, store.ErrHistoryExists) {
			continue // another run got there first; the week is stored either way
		}
		if err != nil {
			return result, fmt.Errorf("snapshot: store week of %s: %w", start.Format("2006-01-02"), err)
		}
		result.Stored = append(result.Stored, startText)
	}
	return result, nil
}

// mondayOnOrAfter is midnight UTC on the first Monday at or after t's day.
func mondayOnOrAfter(t time.Time) time.Time {
	day := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	if day.Before(t) {
		day = day.AddDate(0, 0, 1)
	}
	return day.AddDate(0, 0, (int(time.Monday)-int(day.Weekday())+7)%7)
}
