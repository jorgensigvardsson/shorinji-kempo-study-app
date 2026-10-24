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
					if !demoActive(branch, m, day) {
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

// demoEpoch is where the invented membership starts. Half the members are there
// from the beginning; the other half join over the following fourteen months, so
// a year of history has growth in it and the last 30 days look settled.
var demoEpoch = time.Date(2025, 9, 1, 0, 0, 0, 0, time.UTC)

// DemoEpoch is exported for the history seeder, which starts there too.
func DemoEpoch() time.Time { return demoEpoch }

func demoJoined(who string) time.Time {
	if demoUnit(who, "late") < 0.5 {
		return demoEpoch.AddDate(0, 0, int(demoUnit(who, "joined")*420))
	}
	return demoEpoch
}

// demoLeft is when a member deleted their account, or the zero time for the nine
// in ten who never do. Leavers go somewhere between a fortnight and a year after
// joining, which gives the history's deletions a spread of lifetimes.
func demoLeft(who string) time.Time {
	if demoUnit(who, "leaves") >= 0.1 {
		return time.Time{}
	}
	return demoJoined(who).AddDate(0, 0, 14+int(demoUnit(who, "stayed")*350))
}

// demoMember reports whether somebody had an account at a moment.
func demoMember(who string, at time.Time) bool {
	left := demoLeft(who)
	return !at.Before(demoJoined(who)) && (left.IsZero() || at.Before(left))
}

// DemoPerson is one invented member, for the history seeder: when they arrived,
// how, and when they left if they did.
type DemoPerson struct {
	Branch   string
	Joined   time.Time
	Left     time.Time // zero if they never left
	ViaAdmin bool      // added by an admin rather than approved from an application
}

// People lists every invented member, the founding ones included.
func (d *Demo) People() []DemoPerson {
	var out []DemoPerson
	for _, branch := range append(d.Branches(), "") {
		for m := 0; m < demoMembers(branch); m++ {
			who := fmt.Sprintf("%s/%d", branch, m)
			out = append(out, DemoPerson{
				Branch:   branch,
				Joined:   demoJoined(who),
				Left:     demoLeft(who),
				ViaAdmin: demoUnit(who, "via") < 0.3,
			})
		}
	}
	return out
}

// demoActive decides whether one member opened the app on one day. Each member
// has an engagement of their own — some open it most days, some barely at all —
// and nobody uses the app before they have joined or after they have left.
func demoActive(branch string, member int, day time.Time) bool {
	who := fmt.Sprintf("%s/%d", branch, member)
	if !demoMember(who, day) {
		return false
	}
	engagement := 0.15 + 0.85*demoUnit(who, "engagement")
	if branch == "" {
		engagement *= 0.5 // the branchless are the least active, as old accounts are
	}

	p := engagement * demoWeekday[day.Weekday()]
	return demoUnit(who, day.Format("2006-01-02")) < p
}

// WeekStats invents one week the way Usage invents a window, from the same
// people, so a stored week and the live page agree about it. Unlike the real
// thing it can answer for any week at all, which is what lets the seeder lay down
// a year of history in one go.
func (d *Demo) WeekStats(_ context.Context, start, end time.Time) (*WeekStats, error) {
	stats := &WeekStats{ByBranch: map[string]int{}, ByMode: map[string]int{}, ByVersion: map[string]int{}}
	seen := map[string]bool{}
	for _, branch := range append(d.Branches(), "") {
		inBranch := 0
		for m := 0; m < demoMembers(branch); m++ {
			who := fmt.Sprintf("%s/%d", branch, m)
			active, lastDay := false, time.Time{}
			for day := start; day.Before(end); day = day.AddDate(0, 0, 1) {
				if demoActive(branch, m, day) {
					active, lastDay = true, day
					stats.Hours += 1 + int(demoUnit(who, day.Format("2006-01-02"), "hours")*3)
				}
			}
			if !active {
				continue
			}
			inBranch++
			seen[who] = true
			mode := "browser"
			if demoUnit(who, "mode") < 0.6 {
				mode = "standalone"
			}
			stats.ByMode[mode]++
			stats.ByVersion[demoVersion(who, lastDay)]++
		}
		if inBranch > 0 {
			stats.ByBranch[branch] = inBranch
		}
	}
	stats.People = len(seen)
	return stats, nil
}

// demoVersion is the build a member's device ran on a day: a release every two
// weeks, which each device picks up somewhere within the following twelve days.
func demoVersion(who string, day time.Time) string {
	lag := time.Duration(demoUnit(who, "lag")*12*24) * time.Hour
	n := int(day.Add(-lag).Sub(demoEpoch).Hours()/24) / 14
	return fmt.Sprintf("demo%03d", max(n, 0))
}

// Members counts the invented accounts each branch had at a moment: those who
// had joined by then and not yet left. The seeder's deletion events are these
// same leavers, so the history's counts and its events agree.
func (d *Demo) Members(at time.Time) map[string]int {
	out := map[string]int{}
	for _, branch := range append(d.Branches(), "") {
		for m := 0; m < demoMembers(branch); m++ {
			if demoMember(fmt.Sprintf("%s/%d", branch, m), at) {
				out[branch]++
			}
		}
	}
	return out
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
