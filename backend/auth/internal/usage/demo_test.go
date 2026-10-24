package usage

import (
	"context"
	"reflect"
	"testing"
	"time"
)

func newTestDemo() *Demo {
	d := NewDemo(func() []string { return []string{"karlstad", "goteborg"} })
	d.now = func() time.Time { return saturday }
	return d
}

// The point of inventing people rather than numbers: the totals have to agree
// with the bars the way real ones do.
func TestDemoAddsUpLikeRealPeople(t *testing.T) {
	daily, err := newTestDemo().Usage(context.Background(), Query{Days: 28, Bin: BinDay})
	if err != nil {
		t.Fatal(err)
	}
	weekly, err := newTestDemo().Usage(context.Background(), Query{Days: 28, Bin: BinWeek})
	if err != nil {
		t.Fatal(err)
	}

	if len(daily.Buckets) != 28 {
		t.Errorf("got %d daily buckets, want 28", len(daily.Buckets))
	}

	sumOfDays, busiestDay := 0, 0
	for _, b := range daily.Buckets {
		sumOfDays += b.People
		busiestDay = max(busiestDay, b.People)
		branchSum := 0
		for _, n := range b.ByBranch {
			branchSum += n
		}
		// Nobody is in two branches, so the branches partition each bar.
		if branchSum != b.People {
			t.Errorf("%v: branches sum to %d, bar says %d", b.Start, branchSum, b.People)
		}
	}
	if daily.People == 0 {
		t.Fatal("the demo invented nobody")
	}
	if daily.People > sumOfDays || daily.People < busiestDay {
		t.Errorf("window total %d is outside [%d, %d]", daily.People, busiestDay, sumOfDays)
	}

	busiestWeek := 0
	for _, b := range weekly.Buckets {
		busiestWeek = max(busiestWeek, b.People)
	}
	if busiestWeek < busiestDay {
		t.Errorf("a week (%d) has fewer people than a day (%d)", busiestWeek, busiestDay)
	}
	if _, ok := daily.ByBranch[""]; !ok {
		t.Error("no branchless members, so the page never shows how it labels them")
	}
}

func TestDemoDrawsTheSameDayTheSameWay(t *testing.T) {
	q := Query{Days: 14, Bin: BinDay}
	first, _ := newTestDemo().Usage(context.Background(), q)
	second, _ := newTestDemo().Usage(context.Background(), q)
	if !reflect.DeepEqual(first, second) {
		t.Error("two identical queries drew different data")
	}
}

func TestDemoPicksUpBranchesAsTheyAppear(t *testing.T) {
	branches := []string{"karlstad"}
	d := NewDemo(func() []string { return branches })
	d.now = func() time.Time { return saturday }
	q := Query{Days: 30, Bin: BinDay}

	before, _ := d.Usage(context.Background(), q)
	branches = append(branches, "oslo")
	after, _ := d.Usage(context.Background(), q)

	if _, ok := before.ByBranch["oslo"]; ok {
		t.Error("oslo appeared before it existed")
	}
	if _, ok := after.ByBranch["oslo"]; !ok {
		t.Error("a branch added while running did not appear")
	}
}
