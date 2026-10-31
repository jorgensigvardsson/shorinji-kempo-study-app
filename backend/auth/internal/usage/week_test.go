package usage

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestWeekStatsAsksForExactlyOneWeekAndReadsEveryPart(t *testing.T) {
	var body map[string]string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&body)
		_ = json.NewEncoder(w).Encode(map[string]any{"tables": []any{map[string]any{
			"columns": []any{
				map[string]string{"name": "part"}, map[string]string{"name": "key"},
				map[string]string{"name": "people"}, map[string]string{"name": "hours"},
			},
			"rows": [][]any{
				{"total", "", 5, 23},
				{"branch", "karlstad", 4, 0},
				{"branch", "", 1, 0},
				{"mode", "standalone", 3, 0},
				{"mode", "browser", 2, 0},
				{"version", "64f2e47", 5, 0},
			},
		}}})
	}))
	defer srv.Close()

	c := NewClient(resourceID, &fakeCredential{})
	c.endpoint = srv.URL
	start := time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC)

	stats, err := c.WeekStats(context.Background(), start, start.Add(week))
	if err != nil {
		t.Fatal(err)
	}

	// The end is exclusive in the query itself: the timespan alone would let a
	// week share its last instant with the next one.
	if !strings.Contains(body["query"], "timestamp >= datetime(2026-10-19T00:00:00Z) and timestamp < datetime(2026-10-26T00:00:00Z)") {
		t.Errorf("query does not bound the week:\n%s", body["query"])
	}
	if !strings.HasPrefix(body["query"], "let usage = customEvents") || strings.Contains(body["query"], "extend kind") {
		t.Errorf("week query repeats a mistake production caught:\n%s", body["query"])
	}
	if stats.People != 5 || stats.Hours != 23 {
		t.Errorf("totals = %d people, %d hours", stats.People, stats.Hours)
	}
	if stats.ByBranch["karlstad"] != 4 || stats.ByBranch[""] != 1 {
		t.Errorf("by branch = %v", stats.ByBranch)
	}
	if stats.ByMode["standalone"] != 3 || stats.ByVersion["64f2e47"] != 5 {
		t.Errorf("by mode %v, by version %v", stats.ByMode, stats.ByVersion)
	}
}

func TestDemoWeekStatsAgreeWithThemselves(t *testing.T) {
	d := newTestDemo()
	start := time.Date(2026, 10, 12, 0, 0, 0, 0, time.UTC)
	stats, err := d.WeekStats(context.Background(), start, start.Add(week))
	if err != nil {
		t.Fatal(err)
	}
	sum := func(m map[string]int) (n int) {
		for _, v := range m {
			n += v
		}
		return n
	}
	// Each person is in one branch, runs in one mode and is counted on one build.
	if stats.People == 0 || sum(stats.ByBranch) != stats.People || sum(stats.ByMode) != stats.People || sum(stats.ByVersion) != stats.People {
		t.Errorf("people %d, branches %v, modes %v, versions %v", stats.People, stats.ByBranch, stats.ByMode, stats.ByVersion)
	}
	if stats.Hours < stats.People {
		t.Errorf("%d hours for %d people", stats.Hours, stats.People)
	}

	// A year ago the membership was smaller than it is now.
	if then, now := d.Members(DemoEpoch()), d.Members(saturday); sum(then) >= sum(now) {
		t.Errorf("members then %d, now %d; the demo should grow", sum(then), sum(now))
	}
}
