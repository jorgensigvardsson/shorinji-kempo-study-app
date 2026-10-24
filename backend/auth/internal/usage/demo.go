package usage

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"time"
)

// Demo makes up usage for a development machine, which has no telemetry to read,
// so the usage page can be looked at before it has anything real to show.
//
// It invents people rather than numbers. Each branch gets a membership, each
// member a habit, and the counts are then taken over those people exactly as the
// real query takes them over pseudonyms — so a week is fewer people than the sum
// of its days, a month fewer than the sum of its weeks, and the totals agree with
// the bars. Random counts would draw a chart that looks plausible and adds up
// wrong, which is the one thing a page about counting people must not teach
// anybody to expect.
//
// Everything is derived from hashes of the branch id, the member and the day, so
// the same day draws the same way on every reload.
type Demo struct {
	// Branches returns the branch ids to invent members for. It is asked on every
	// query, so branches added while the service runs turn up straight away.
	Branches func() []string
	now      func() time.Time
}

func NewDemo(branches func() []string) *Demo {
	return &Demo{Branches: branches, now: time.Now}
}

// How likely a member is to open the app, by weekday (Sunday first). Training is
// mostly on weekday evenings, and the app is mostly opened around training.
var demoWeekday = [7]float64{0.25, 0.55, 0.35, 0.6, 0.4, 0.2, 0.3}

func (d *Demo) Usage(_ context.Context, q Query) (*Report, error) {
	if err := q.Validate(); err != nil {
		return nil, err
	}
	from, to := Window(q, d.now())

	// Members with no branch: accounts from before branches existed. Few, and
	// fading, as they would be in reality.
	branches := append(d.Branches(), "")

	report := &Report{From: from, To: to, Bin: q.Bin, Buckets: []Bucket{}, ByBranch: map[string]int{}, Demo: true}
	window := map[string]bool{}
	windowByBranch := map[string]map[string]bool{}

	for start := from; start.Before(to); start = next(start, q.Bin) {
		end := next(start, q.Bin)
		bucket := Bucket{Start: start, ByBranch: map[string]int{}}
		seen := map[string]bool{}

		for _, branch := range branches {
			members := demoMembers(branch)
			inBranch := map[string]bool{}
			for day := start; day.Before(end) && day.Before(to); day = day.AddDate(0, 0, 1) {
				for m := 0; m < members; m++ {
					if !demoActive(branch, m, day, from) {
						continue
					}
					person := fmt.Sprintf("%s/%d", branch, m)
					inBranch[person] = true
					seen[person] = true
					window[person] = true
					if windowByBranch[branch] == nil {
						windowByBranch[branch] = map[string]bool{}
					}
					windowByBranch[branch][person] = true
				}
			}
			if len(inBranch) > 0 {
				bucket.ByBranch[branch] = len(inBranch)
			}
		}
		bucket.People = len(seen)
		report.Buckets = append(report.Buckets, bucket)
	}

	report.People = len(window)
	for branch, people := range windowByBranch {
		report.ByBranch[branch] = len(people)
	}
	return report, nil
}

func next(t time.Time, bin Bin) time.Time {
	if bin == BinWeek {
		return t.AddDate(0, 0, 7)
	}
	return t.AddDate(0, 0, 1)
}

// demoMembers sizes a branch: somewhere between six and thirty members who use
// the app, which is roughly what a club has.
func demoMembers(branch string) int {
	if branch == "" {
		return 3
	}
	return 6 + int(demoHash(branch, "size")%25)
}

// demoActive decides whether one member opened the app on one day. Each member
// has an engagement of their own — some open it most days, some barely at all —
// and members join over the window rather than all being there from its first
// day, so the chart has a slope to it as well as a weekly rhythm.
func demoActive(branch string, member int, day, windowStart time.Time) bool {
	who := fmt.Sprintf("%s/%d", branch, member)
	engagement := 0.15 + 0.85*demoUnit(who, "engagement")

	// A third of the members arrive at some point during the window.
	if demoUnit(who, "late") < 0.33 {
		joined := windowStart.AddDate(0, 0, int(demoUnit(who, "joined")*60))
		if day.Before(joined) {
			return false
		}
	}
	if branch == "" {
		engagement *= 0.5 // the branchless are the least active, as old accounts are
	}

	p := engagement * demoWeekday[day.Weekday()]
	return demoUnit(who, day.Format("2006-01-02")) < p
}

// demoUnit maps its inputs to a number in [0, 1), the same one every time.
func demoUnit(parts ...string) float64 {
	return float64(demoHash(parts...)%1_000_000) / 1_000_000
}

func demoHash(parts ...string) uint64 {
	h := sha256.New()
	for _, p := range parts {
		h.Write([]byte(p))
		h.Write([]byte{0})
	}
	return binary.BigEndian.Uint64(h.Sum(nil)[:8])
}
