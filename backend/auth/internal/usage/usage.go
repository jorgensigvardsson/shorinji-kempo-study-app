// Package usage reads the app's own usage telemetry back out of Application
// Insights, for the technical admin's usage page.
//
// The browser cannot do this itself. Reading telemetry takes an Entra identity,
// and the only identity a browser could carry here would be a credential shipped
// in the bundle — readable by anybody who opens developer tools. So the auth
// service asks on its behalf, with the container's managed identity, and hands
// back counts.
//
// Three things are deliberate about how it asks:
//
//   - The query text is fixed in this file. The caller chooses a window and a
//     bucket size from a short list and nothing else; no part of a request is ever
//     spliced into KQL.
//   - It queries the Application Insights resource, not the workspace behind it.
//     The workspace also holds both containers' logs, and the identity this runs
//     under has no business reading those. A resource-scoped query sees the app's
//     telemetry and nothing beside it, so the role assignment can be scoped the
//     same way.
//   - What leaves is counts. The pseudonyms the counting is done over stay in
//     Azure; the response could not identify anybody even if it were leaked.
package usage

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/policy"
)

// Bin is how wide one bar of the chart is.
type Bin string

const (
	BinDay  Bin = "day"
	BinWeek Bin = "week"
)

// MaxDays bounds the window. Telemetry is kept for 30 days today, so anything
// past that comes back empty rather than wrong; the ceiling is there so that a
// longer retention later needs no change here, and so that nobody can ask for a
// decade.
const MaxDays = 90

// Query is everything a caller may choose.
type Query struct {
	Days int
	Bin  Bin
}

// Validate reports whether q is something this package will run.
func (q Query) Validate() error {
	if q.Days < 1 || q.Days > MaxDays {
		return fmt.Errorf("days must be between 1 and %d", MaxDays)
	}
	if q.Bin != BinDay && q.Bin != BinWeek {
		return fmt.Errorf("bin must be %q or %q", BinDay, BinWeek)
	}
	return nil
}

// Bucket is one bar: how many distinct people used the app in it, overall and per
// branch.
type Bucket struct {
	Start    time.Time      `json:"start"`
	People   int            `json:"people"`
	ByBranch map[string]int `json:"byBranch"`
}

// Report is the whole answer. The window totals are counted separately rather
// than summed from the buckets, because they cannot be: somebody active on three
// days is one person in the month and three in the sum of its days.
//
// Branch keys are branch ids. The empty key is events that named no branch — an
// account admitted before branches existed, or a build from before events carried
// one.
type Report struct {
	From     time.Time      `json:"from"`
	To       time.Time      `json:"to"`
	Bin      Bin            `json:"bin"`
	Buckets  []Bucket       `json:"buckets"`
	People   int            `json:"people"`
	ByBranch map[string]int `json:"byBranch"`
	// Demo marks invented data (see demo.go), so the page can say so rather than
	// let a developer's screenshot pass for real numbers.
	Demo bool `json:"demo,omitempty"`
}

// Source is what the HTTP handler needs: something that answers a query. The
// client below is the real one; tests substitute their own.
type Source interface {
	Usage(ctx context.Context, q Query) (*Report, error)
}

// The scope Log Analytics tokens are issued for. It is the same whichever of the
// API's host names a request goes to.
const tokenScope = "https://api.loganalytics.io/.default"

const defaultEndpoint = "https://api.loganalytics.azure.com"

// allBranches marks the rows that count everybody rather than one branch. A real
// branch id is a UUID, so this cannot collide with one.
const allBranches = "*"

// The query. Bucketing is done by the server so the bars line up with calendar
// days and weeks in UTC; a week starts on Monday, as it does in every country the
// app is used in, which startofweek — Sunday-based — needs a nudge to agree with.
//
// The four parts of the union are the per-branch bars, the overall bars, and the
// same two over the whole window. They are one query rather than four because a
// cold container pays for the token and the round trip once.
//
// dcount at accuracy 4 is exact at this population's size; the HyperLogLog it is
// built on only starts estimating far beyond any membership this app will have.
const queryTemplate = `let usage = AppEvents
| where Name == "usage"
| extend uid = tostring(Properties.uid), branch = tostring(Properties.branch)
| where isnotempty(uid);
let bucketed = usage | extend bucket = %s;
union
  (bucketed | summarize people = dcount(uid, 4) by bucket, branch | extend kind = "bucket"),
  (bucketed | summarize people = dcount(uid, 4) by bucket | extend kind = "bucket", branch = "*"),
  (usage | summarize people = dcount(uid, 4) by branch | extend kind = "window", bucket = datetime(null)),
  (usage | summarize people = dcount(uid, 4) | extend kind = "window", branch = "*", bucket = datetime(null))
| project kind, bucket, branch, people`

var bucketExpressions = map[Bin]string{
	BinDay:  "startofday(TimeGenerated)",
	BinWeek: "startofweek(TimeGenerated - 1d) + 1d",
}

// Client queries one Application Insights resource through the Log Analytics API.
type Client struct {
	resourceID string
	credential azcore.TokenCredential
	httpClient *http.Client
	endpoint   string
	now        func() time.Time
}

// NewClient returns a client for the Application Insights resource with this
// Azure resource id ("/subscriptions/…/providers/microsoft.insights/components/…").
func NewClient(resourceID string, credential azcore.TokenCredential) *Client {
	return &Client{
		resourceID: strings.TrimSuffix(resourceID, "/"),
		credential: credential,
		httpClient: &http.Client{Timeout: 20 * time.Second},
		endpoint:   defaultEndpoint,
		now:        time.Now,
	}
}

// Window returns the span a query covers: from the start of the first whole
// bucket to now. Starting on a boundary is what keeps the first bar from being a
// partial day, or a partial week, that reads as a dip in use.
func Window(q Query, now time.Time) (from, to time.Time) {
	now = now.UTC()
	from = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -(q.Days - 1))
	if q.Bin == BinWeek {
		// Back to the Monday on or before. Weekday counts from Sunday = 0.
		from = from.AddDate(0, 0, -((int(from.Weekday()) + 6) % 7))
	}
	return from, now
}

// ErrNotPermitted is returned when Azure refuses the identity. Right after a
// deploy that is usually the role assignment not having propagated yet, which
// takes minutes, so it is worth telling apart from a fault.
var ErrNotPermitted = errors.New("usage: the service identity may not read telemetry")

func (c *Client) Usage(ctx context.Context, q Query) (*Report, error) {
	if err := q.Validate(); err != nil {
		return nil, err
	}
	from, to := Window(q, c.now())

	token, err := c.credential.GetToken(ctx, policy.TokenRequestOptions{Scopes: []string{tokenScope}})
	if err != nil {
		return nil, fmt.Errorf("usage: token: %w", err)
	}

	body, err := json.Marshal(map[string]string{
		"query": fmt.Sprintf(queryTemplate, bucketExpressions[q.Bin]),
		// An explicit interval rather than a duration, so the window starts on the
		// boundary Window chose rather than exactly N days before the request.
		"timespan": from.Format(time.RFC3339) + "/" + to.Format(time.RFC3339),
	})
	if err != nil {
		return nil, fmt.Errorf("usage: encode query: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint+"/v1"+c.resourceID+"/query", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("usage: request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token.Token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("usage: query: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusUnauthorized {
		return nil, ErrNotPermitted
	}
	if resp.StatusCode != http.StatusOK {
		// The error body is Azure's explanation, which is the useful part of the
		// log line; it is bounded because it is not ours.
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("usage: query: %s: %s", resp.Status, strings.TrimSpace(string(detail)))
	}

	var result queryResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&result); err != nil {
		return nil, fmt.Errorf("usage: decode response: %w", err)
	}
	report, err := result.report()
	if err != nil {
		return nil, err
	}
	report.From, report.To, report.Bin = from, to, q.Bin
	return report, nil
}

// queryResponse is the part of the Log Analytics response this reads: tables of
// named columns and positional rows.
type queryResponse struct {
	Tables []struct {
		Columns []struct {
			Name string `json:"name"`
		} `json:"columns"`
		Rows [][]any `json:"rows"`
	} `json:"tables"`
}

// report folds the rows into buckets and totals. Columns are found by name rather
// than position, so a reordering on Azure's side cannot quietly swap two of them.
func (r queryResponse) report() (*Report, error) {
	report := &Report{Buckets: []Bucket{}, ByBranch: map[string]int{}}
	if len(r.Tables) == 0 {
		return report, nil
	}
	table := r.Tables[0]

	col := map[string]int{}
	for i, c := range table.Columns {
		col[c.Name] = i
	}
	for _, name := range []string{"kind", "bucket", "branch", "people"} {
		if _, ok := col[name]; !ok {
			return nil, fmt.Errorf("usage: response has no %q column", name)
		}
	}

	buckets := map[time.Time]*Bucket{}
	for _, row := range table.Rows {
		if len(row) != len(table.Columns) {
			return nil, fmt.Errorf("usage: row has %d values for %d columns", len(row), len(table.Columns))
		}
		kind, _ := row[col["kind"]].(string)
		branch, _ := row[col["branch"]].(string)
		// JSON numbers decode as float64; the counts are whole numbers.
		peopleValue, ok := row[col["people"]].(float64)
		if !ok {
			return nil, fmt.Errorf("usage: people is %T, not a number", row[col["people"]])
		}
		people := int(peopleValue)

		switch kind {
		case "window":
			if branch == allBranches {
				report.People = people
			} else {
				report.ByBranch[branch] = people
			}
		case "bucket":
			text, _ := row[col["bucket"]].(string)
			start, err := time.Parse(time.RFC3339Nano, text)
			if err != nil {
				return nil, fmt.Errorf("usage: bucket %q: %w", text, err)
			}
			start = start.UTC()
			b := buckets[start]
			if b == nil {
				b = &Bucket{Start: start, ByBranch: map[string]int{}}
				buckets[start] = b
			}
			if branch == allBranches {
				b.People = people
			} else {
				b.ByBranch[branch] = people
			}
		default:
			return nil, fmt.Errorf("usage: unknown row kind %q", kind)
		}
	}

	for _, b := range buckets {
		report.Buckets = append(report.Buckets, *b)
	}
	sort.Slice(report.Buckets, func(i, j int) bool { return report.Buckets[i].Start.Before(report.Buckets[j].Start) })
	return report, nil
}

// Cached answers repeated questions from memory for a while.
//
// The usage events arrive at most once an hour per device, so a report is not
// going to change in the next few minutes however often it is asked for — and the
// usage page asks every time somebody switches between day and week. The auth
// service runs a single replica, so an in-process cache is coherent by
// construction.
type Cached struct {
	source Source
	ttl    time.Duration
	now    func() time.Time

	mu      sync.Mutex
	entries map[Query]cacheEntry
}

type cacheEntry struct {
	report *Report
	until  time.Time
}

func NewCached(source Source, ttl time.Duration) *Cached {
	return &Cached{source: source, ttl: ttl, now: time.Now, entries: map[Query]cacheEntry{}}
}

func (c *Cached) Usage(ctx context.Context, q Query) (*Report, error) {
	now := c.now()
	c.mu.Lock()
	if e, ok := c.entries[q]; ok && now.Before(e.until) {
		c.mu.Unlock()
		return e.report, nil
	}
	c.mu.Unlock()

	// Not held across the query: two callers racing on a cold entry both ask, which
	// costs one extra free query and saves serializing every other key behind it.
	report, err := c.source.Usage(ctx, q)
	if err != nil {
		return nil, err // failures are not cached; the next ask tries again
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	// The key space is the handful of valid queries, but expired entries are swept
	// anyway so nothing grows without bound.
	for k, e := range c.entries {
		if !now.Before(e.until) {
			delete(c.entries, k)
		}
	}
	c.entries[q] = cacheEntry{report: report, until: now.Add(c.ttl)}
	return report, nil
}
