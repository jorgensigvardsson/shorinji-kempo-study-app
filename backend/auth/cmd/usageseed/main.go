// Command usageseed fills a local data directory with a year of invented usage
// history, so the usage page's long view has something to draw on a development
// machine.
//
// It writes what production accumulates on its own over months: a weekly
// snapshot for every finished week since the demo membership began, and the
// events that go with that membership — accounts created and deleted, the
// applications behind them, and a scattering of members moving between branches.
// The members are usage.Demo's, invented for whatever branches the directory
// holds, so the history agrees with the live demo the usage page shows.
//
// Every entry's id is derived from what it describes, so running it again adds
// only weeks that have finished since and nothing twice. It refuses to run while
// COSMOS_* is set, the same guard devseed has: invented history must never land
// anywhere real. Dry run unless --apply.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"flag"
	"fmt"
	"log"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/org"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/usage"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/envutil"
)

func main() {
	log.SetFlags(0)

	dataDir := flag.String("data-dir", envutil.String("SERVICE_DATA_DIR", "data"), "the auth service's local data directory")
	apply := flag.Bool("apply", false, "actually write; without it the tool reports what it would do and writes nothing")
	flag.Parse()

	if envutil.String("COSMOS_ENDPOINT", "") != "" || envutil.String("COSMOS_KEY", "") != "" {
		log.Fatal("COSMOS_ENDPOINT/COSMOS_KEY are set — usageseed only ever writes invented history to a local data directory.")
	}

	tree := org.New(store.NewFileOrgStore(*dataDir))
	if err := tree.Reload(); err != nil {
		log.Fatalf("read the organization in %s: %v", *dataDir, err)
	}
	var branches []string
	for _, b := range tree.Branches() {
		branches = append(branches, b.ID)
	}
	if len(branches) == 0 {
		log.Fatalf("%s has no branches; run cmd/devseed first, or add some on the Organisation page", *dataDir)
	}

	demo := usage.NewDemo(func() []string { return branches })
	entries := events(demo, branches, time.Now().UTC())
	weeks, err := snapshots(demo, time.Now().UTC())
	if err != nil {
		log.Fatal(err)
	}
	entries = append(entries, weeks...)

	counts := map[string]int{}
	for _, e := range entries {
		counts[e.Type]++
	}
	log.Printf("%d branches; %d weekly snapshots, %d accounts created, %d deleted, %d moves, %d application events",
		len(branches), counts[store.HistoryWeek], counts[store.HistoryAccountCreated],
		counts[store.HistoryAccountDeleted], counts[store.HistoryTransfer], counts[store.HistoryApplication])

	if !*apply {
		log.Print("DRY RUN — nothing was written. Re-run with --apply.")
		return
	}

	history := store.NewFileHistoryStore(*dataDir)
	written, skipped := 0, 0
	for _, e := range entries {
		err := history.Append(e)
		switch {
		case errors.Is(err, store.ErrHistoryExists):
			skipped++
		case err != nil:
			log.Fatalf("write %s: %v", e.ID, err)
		default:
			written++
		}
	}
	log.Printf("wrote %d entries to %s/history (%d already there)", written, *dataDir, skipped)
	log.Print("Reload the usage page; its long view reads them straight away.")
}

// snapshots are the weeks from the first Monday of the demo membership to the
// last one that has finished.
func snapshots(demo *usage.Demo, now time.Time) ([]*store.HistoryEntry, error) {
	var out []*store.HistoryEntry
	start := usage.DemoEpoch()
	for start.Weekday() != time.Monday {
		start = start.AddDate(0, 0, 1)
	}
	for ; !start.AddDate(0, 0, 7).After(now); start = start.AddDate(0, 0, 7) {
		end := start.AddDate(0, 0, 7)
		stats, err := demo.WeekStats(context.Background(), start, end)
		if err != nil {
			return nil, err
		}
		text := start.Format(time.RFC3339)
		out = append(out, &store.HistoryEntry{
			ID: store.WeekID(text), Type: store.HistoryWeek, At: end.Format(time.RFC3339),
			Week: &store.WeekSnapshot{
				Start: text, People: stats.People, ByBranch: stats.ByBranch, Hours: stats.Hours,
				ByMode: stats.ByMode, ByVersion: stats.ByVersion,
				// As the job counts it: at the time of the snapshot, which for the
				// seeder is the week's end.
				Members: demo.Members(end),
			},
		})
	}
	return out, nil
}

// events are the membership's history: every member who joined after the demo
// began arrived through an application or an admin, every leaver left, a few
// applicants were turned away or changed their minds, and a few members moved.
func events(demo *usage.Demo, branches []string, now time.Time) []*store.HistoryEntry {
	var out []*store.HistoryEntry
	add := func(id, typ string, at time.Time, e store.HistoryEntry) {
		if at.After(now) {
			return
		}
		e.ID, e.Type, e.At = "seed:"+id, typ, at.Format(time.RFC3339)
		out = append(out, &e)
	}

	for i, p := range demo.People() {
		who := fmt.Sprintf("%d", i)
		if p.Joined.After(usage.DemoEpoch()) {
			if p.ViaAdmin {
				add("created:"+who, store.HistoryAccountCreated, p.Joined, store.HistoryEntry{Branch: p.Branch, Via: store.ViaAdmin})
			} else {
				applied := p.Joined.Add(-time.Duration(1+unit(who, "wait")*96) * time.Hour)
				add("applied:"+who, store.HistoryApplication, applied, store.HistoryEntry{Branch: p.Branch, Outcome: store.ApplicationSubmitted})
				add("approved:"+who, store.HistoryApplication, p.Joined, store.HistoryEntry{Branch: p.Branch, Outcome: store.ApplicationApproved})
				add("created:"+who, store.HistoryAccountCreated, p.Joined, store.HistoryEntry{Branch: p.Branch, Via: store.ViaApplied})
			}
		}
		if !p.Left.IsZero() {
			add("deleted:"+who, store.HistoryAccountDeleted, p.Left,
				store.HistoryEntry{Branch: p.Branch, Lifetime: lifetime(p.Left.Sub(p.Joined))})
		}
	}

	// Applications that came to nothing: about one a month, declined or withdrawn.
	for n := 0; n < 14; n++ {
		id := fmt.Sprintf("turned-away:%d", n)
		at := usage.DemoEpoch().AddDate(0, 0, int(unit(id, "day")*420))
		branch := branches[int(unit(id, "branch")*float64(len(branches)))]
		add(id+":applied", store.HistoryApplication, at, store.HistoryEntry{Branch: branch, Outcome: store.ApplicationSubmitted})
		outcome := store.ApplicationDeclined
		if unit(id, "outcome") < 0.4 {
			outcome = store.ApplicationWithdrawn
		}
		add(id+":"+outcome, store.HistoryApplication, at.Add(36*time.Hour), store.HistoryEntry{Branch: branch, Outcome: outcome})
	}

	// Members moving town. Only between branches that exist, so with one branch
	// there are none.
	if len(branches) > 1 {
		for n := 0; n < 9; n++ {
			id := fmt.Sprintf("move:%d", n)
			from := int(unit(id, "from") * float64(len(branches)))
			to := (from + 1 + int(unit(id, "to")*float64(len(branches)-1))) % len(branches)
			via := store.ViaRequest
			if unit(id, "via") < 0.35 {
				via = store.ViaAdmin
			}
			add(id, store.HistoryTransfer, usage.DemoEpoch().AddDate(0, 0, int(unit(id, "day")*420)),
				store.HistoryEntry{From: branches[from], To: branches[to], Via: via})
		}
	}
	return out
}

// lifetime mirrors the auth service's buckets for a deleted account.
func lifetime(d time.Duration) string {
	switch days := d.Hours() / 24; {
	case days < 30:
		return "<1m"
	case days < 182:
		return "1-6m"
	case days < 365:
		return "6-12m"
	case days < 730:
		return "1-2y"
	default:
		return "2y+"
	}
}

func unit(parts ...string) float64 {
	h := sha256.New()
	for _, p := range parts {
		h.Write([]byte("usageseed:" + p))
		h.Write([]byte{0})
	}
	return float64(binary.BigEndian.Uint64(h.Sum(nil)[:8])%1_000_000) / 1_000_000
}
