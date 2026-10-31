package usage

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/policy"
)

type fakeCredential struct{ scopes []string }

func (f *fakeCredential) GetToken(_ context.Context, opts policy.TokenRequestOptions) (azcore.AccessToken, error) {
	f.scopes = opts.Scopes
	return azcore.AccessToken{Token: "test-token", ExpiresOn: time.Now().Add(time.Hour)}, nil
}

const resourceID = "/subscriptions/s/resourceGroups/rg/providers/microsoft.insights/components/app-insights"

// A Saturday afternoon, so a weekly window has to reach back to a Monday.
var saturday = time.Date(2026, 10, 24, 15, 30, 0, 0, time.UTC)

// serve stands in for the Log Analytics API, recording what it was asked and
// answering with the given rows under the column names the query projects.
func serve(t *testing.T, status int, rows [][]any) (*Client, *http.Request, *map[string]string) {
	t.Helper()
	var got http.Request
	var body map[string]string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = *r
		_ = json.NewDecoder(r.Body).Decode(&body)
		w.WriteHeader(status)
		if status != http.StatusOK {
			_, _ = w.Write([]byte(`{"error":{"message":"nope"}}`))
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"tables": []any{map[string]any{
				"name": "PrimaryResult",
				"columns": []any{
					map[string]string{"name": "part", "type": "string"},
					map[string]string{"name": "bucket", "type": "datetime"},
					map[string]string{"name": "branch", "type": "string"},
					map[string]string{"name": "people", "type": "long"},
				},
				"rows": rows,
			}},
		})
	}))
	t.Cleanup(srv.Close)

	c := NewClient(resourceID, &fakeCredential{})
	c.endpoint = srv.URL
	c.now = func() time.Time { return saturday }
	return c, &got, &body
}

func TestValidateRefusesAnythingOffTheList(t *testing.T) {
	for _, q := range []Query{
		{Days: 0, Bin: BinDay},
		{Days: MaxDays + 1, Bin: BinDay},
		{Days: 30, Bin: "hour"},
		{Days: 30, Bin: `day") | take 1 //`},
	} {
		if q.Validate() == nil {
			t.Errorf("Validate(%+v) accepted it", q)
		}
	}
	if err := (Query{Days: 30, Bin: BinWeek}).Validate(); err != nil {
		t.Errorf("Validate refused a valid query: %v", err)
	}
}

func TestWindowStartsOnABucketBoundary(t *testing.T) {
	from, to := Window(Query{Days: 7, Bin: BinDay}, saturday)
	if want := time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC); !from.Equal(want) {
		t.Errorf("daily from = %v, want %v (today and the six days before it)", from, want)
	}
	if !to.Equal(saturday) {
		t.Errorf("to = %v, want now", to)
	}

	// Seven days back from Saturday the 24th is Sunday the 18th; the week that
	// contains it began on Monday the 12th.
	from, _ = Window(Query{Days: 7, Bin: BinWeek}, saturday)
	if want := time.Date(2026, 10, 12, 0, 0, 0, 0, time.UTC); !from.Equal(want) {
		t.Errorf("weekly from = %v, want %v", from, want)
	}

	// A Monday is already its own week's start.
	monday := time.Date(2026, 10, 19, 9, 0, 0, 0, time.UTC)
	from, _ = Window(Query{Days: 1, Bin: BinWeek}, monday)
	if want := time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC); !from.Equal(want) {
		t.Errorf("weekly from on a Monday = %v, want %v", from, want)
	}
}

func TestUsageFoldsRowsIntoBucketsAndTotals(t *testing.T) {
	c, req, body := serve(t, http.StatusOK, [][]any{
		{"bucket", "2026-10-23T00:00:00Z", "b1", 3},
		{"bucket", "2026-10-23T00:00:00Z", "", 1},
		{"bucket", "2026-10-23T00:00:00Z", "*", 4},
		{"bucket", "2026-10-22T00:00:00Z", "b1", 2},
		{"bucket", "2026-10-22T00:00:00Z", "*", 2},
		{"window", nil, "b1", 3},
		{"window", nil, "", 1},
		{"window", nil, "*", 4},
	})

	report, err := c.Usage(context.Background(), Query{Days: 7, Bin: BinDay})
	if err != nil {
		t.Fatalf("Usage: %v", err)
	}

	if req.URL.Path != "/v1"+resourceID+"/query" {
		t.Errorf("queried %s, want the resource-scoped endpoint", req.URL.Path)
	}
	if got := req.Header.Get("Authorization"); got != "Bearer test-token" {
		t.Errorf("Authorization = %q", got)
	}
	if got := (*body)["timespan"]; got != "2026-10-18T00:00:00Z/2026-10-24T15:30:00Z" {
		t.Errorf("timespan = %q", got)
	}
	if !strings.Contains((*body)["query"], "startofday(timestamp)") {
		t.Errorf("daily query does not bucket by day:\n%s", (*body)["query"])
	}
	// Both found the hard way in production; see queryTemplate.
	if !strings.HasPrefix((*body)["query"], "let usage = customEvents") || strings.Contains((*body)["query"], "AppEvents") {
		t.Errorf("a component-scoped query must read the classic customEvents table:\n%s", (*body)["query"])
	}
	if strings.Contains((*body)["query"], "extend kind") {
		t.Errorf("kind is a KQL keyword and does not parse as a column name:\n%s", (*body)["query"])
	}

	// Seven days asked for, two with rows: the other five are there, empty, so
	// the chart shows them as quiet rather than closing up around them.
	if len(report.Buckets) != 7 {
		t.Fatalf("got %d buckets, want one per day of the window", len(report.Buckets))
	}
	for i, b := range report.Buckets {
		if want := time.Date(2026, 10, 18+i, 0, 0, 0, 0, time.UTC); !b.Start.Equal(want) {
			t.Errorf("bucket %d starts %v, want %v", i, b.Start, want)
		}
	}
	if b := report.Buckets[0]; b.People != 0 || b.ByBranch == nil {
		t.Errorf("a quiet day = %+v, want zero people and an empty branch map", b)
	}
	second := report.Buckets[5]
	if second.People != 4 || second.ByBranch["b1"] != 3 || second.ByBranch[""] != 1 {
		t.Errorf("second bucket = %+v", second)
	}
	if _, ok := second.ByBranch["*"]; ok {
		t.Errorf("the everybody marker leaked into a branch: %+v", second.ByBranch)
	}
	if report.People != 4 || report.ByBranch["b1"] != 3 || report.ByBranch[""] != 1 {
		t.Errorf("totals = %d, %+v", report.People, report.ByBranch)
	}
	if report.Bin != BinDay || !report.From.Equal(time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("report window = %v %v", report.Bin, report.From)
	}
}

func TestUsageAsksForALogAnalyticsToken(t *testing.T) {
	cred := &fakeCredential{}
	c, _, _ := serve(t, http.StatusOK, nil)
	c.credential = cred

	if _, err := c.Usage(context.Background(), Query{Days: 7, Bin: BinWeek}); err != nil {
		t.Fatalf("Usage: %v", err)
	}
	if len(cred.scopes) != 1 || cred.scopes[0] != tokenScope {
		t.Errorf("token scopes = %v", cred.scopes)
	}
}

// Straight after a deploy the role assignment may not have reached the identity
// yet. That is worth saying in so many words, rather than as a generic failure.
func TestUsageReportsARefusalAsSuch(t *testing.T) {
	c, _, _ := serve(t, http.StatusForbidden, nil)

	_, err := c.Usage(context.Background(), Query{Days: 7, Bin: BinDay})
	if !errors.Is(err, ErrNotPermitted) {
		t.Errorf("err = %v, want ErrNotPermitted", err)
	}
}

func TestUsageRefusesAnInvalidQueryWithoutAsking(t *testing.T) {
	c, req, _ := serve(t, http.StatusOK, nil)

	if _, err := c.Usage(context.Background(), Query{Days: 7, Bin: "minute"}); err == nil {
		t.Fatal("an invalid query ran")
	}
	if req.URL != nil {
		t.Error("an invalid query reached Azure")
	}
}

type countingSource struct {
	calls int
	err   error
}

func (s *countingSource) Usage(context.Context, Query) (*Report, error) {
	s.calls++
	if s.err != nil {
		return nil, s.err
	}
	return &Report{People: s.calls}, nil
}

func TestCachedAnswersRepeatsFromMemoryUntilTheyExpire(t *testing.T) {
	source := &countingSource{}
	cached := NewCached(source, 10*time.Minute)
	now := saturday
	cached.now = func() time.Time { return now }
	q := Query{Days: 30, Bin: BinDay}

	for i := 0; i < 3; i++ {
		if _, err := cached.Usage(context.Background(), q); err != nil {
			t.Fatal(err)
		}
	}
	if source.calls != 1 {
		t.Errorf("source asked %d times, want 1", source.calls)
	}

	// A different question is a different entry.
	if _, err := cached.Usage(context.Background(), Query{Days: 30, Bin: BinWeek}); err != nil {
		t.Fatal(err)
	}
	if source.calls != 2 {
		t.Errorf("source asked %d times, want 2", source.calls)
	}

	now = now.Add(11 * time.Minute)
	if _, err := cached.Usage(context.Background(), q); err != nil {
		t.Fatal(err)
	}
	if source.calls != 3 {
		t.Errorf("an expired entry was served: source asked %d times, want 3", source.calls)
	}
}

func TestCachedDoesNotRememberFailures(t *testing.T) {
	source := &countingSource{err: errors.New("down")}
	cached := NewCached(source, 10*time.Minute)
	q := Query{Days: 30, Bin: BinDay}

	_, _ = cached.Usage(context.Background(), q)
	source.err = nil
	report, err := cached.Usage(context.Background(), q)
	if err != nil || report == nil {
		t.Fatalf("a failure was cached: %v", err)
	}
}
