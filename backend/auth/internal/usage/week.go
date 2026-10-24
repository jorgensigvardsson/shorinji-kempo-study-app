package usage

import (
	"context"
	"fmt"
	"time"
)

// WeekStats is everything the weekly snapshot keeps about one week of use.
// Every count but Hours is of distinct people.
type WeekStats struct {
	People    int
	ByBranch  map[string]int
	Hours     int // usage events, at most one an hour per device
	ByMode    map[string]int
	ByVersion map[string]int
}

// WeekStatser reads one finished week. The client reads it from Application
// Insights; the demo invents it.
type WeekStatser interface {
	WeekStats(ctx context.Context, start, end time.Time) (*WeekStats, error)
}

// The week query: the same customEvents rows as the usage page reads, counted
// once overall and once per branch, display mode and build. The boundaries are
// written into the query as well as sent as the timespan, because the timespan
// alone is inclusive at both ends and a week must not share its last instant
// with the next one. They are formatted by this code from time values; nothing a
// caller sends reaches the text.
//
// "part" rather than "kind", and customEvents rather than AppEvents: see
// queryTemplate for why.
const weekQueryTemplate = `let usage = customEvents
| where name == "usage" and timestamp >= datetime(%s) and timestamp < datetime(%s)
| extend uid = tostring(customDimensions.uid), branch = tostring(customDimensions.branch),
         mode = tostring(customDimensions.mode), ver = tostring(customDimensions.ver)
| where isnotempty(uid);
union
  (usage | summarize people = dcount(uid, 4), hours = count() | extend part = "total", key = ""),
  (usage | summarize people = dcount(uid, 4) by key = branch | extend part = "branch", hours = 0),
  (usage | summarize people = dcount(uid, 4) by key = mode | extend part = "mode", hours = 0),
  (usage | summarize people = dcount(uid, 4) by key = ver | extend part = "version", hours = 0)
| project part, key, people, hours`

func (c *Client) WeekStats(ctx context.Context, start, end time.Time) (*WeekStats, error) {
	query := fmt.Sprintf(weekQueryTemplate, start.UTC().Format(time.RFC3339), end.UTC().Format(time.RFC3339))
	result, err := c.run(ctx, query, start, end)
	if err != nil {
		return nil, err
	}
	return result.weekStats()
}

func (r queryResponse) weekStats() (*WeekStats, error) {
	stats := &WeekStats{ByBranch: map[string]int{}, ByMode: map[string]int{}, ByVersion: map[string]int{}}
	if len(r.Tables) == 0 {
		return stats, nil
	}
	table := r.Tables[0]
	col := map[string]int{}
	for i, c := range table.Columns {
		col[c.Name] = i
	}
	for _, name := range []string{"part", "key", "people", "hours"} {
		if _, ok := col[name]; !ok {
			return nil, fmt.Errorf("usage: week response has no %q column", name)
		}
	}
	number := func(row []any, name string) (int, error) {
		v, ok := row[col[name]].(float64)
		if !ok {
			return 0, fmt.Errorf("usage: %s is %T, not a number", name, row[col[name]])
		}
		return int(v), nil
	}
	for _, row := range table.Rows {
		if len(row) != len(table.Columns) {
			return nil, fmt.Errorf("usage: row has %d values for %d columns", len(row), len(table.Columns))
		}
		part, _ := row[col["part"]].(string)
		key, _ := row[col["key"]].(string)
		people, err := number(row, "people")
		if err != nil {
			return nil, err
		}
		switch part {
		case "total":
			hours, err := number(row, "hours")
			if err != nil {
				return nil, err
			}
			stats.People, stats.Hours = people, hours
		case "branch":
			stats.ByBranch[key] = people
		case "mode":
			stats.ByMode[key] = people
		case "version":
			stats.ByVersion[key] = people
		default:
			return nil, fmt.Errorf("usage: unknown row part %q", part)
		}
	}
	return stats, nil
}
