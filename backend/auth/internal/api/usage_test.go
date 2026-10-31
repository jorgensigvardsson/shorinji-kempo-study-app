package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/usage"
)

type fakeUsage struct {
	asked  []usage.Query
	report *usage.Report
	err    error
}

func (f *fakeUsage) Usage(_ context.Context, q usage.Query) (*usage.Report, error) {
	f.asked = append(f.asked, q)
	return f.report, f.err
}

func usageAs(t *testing.T, h *Handler, roles []string, query string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.adminUsage(rec, authedRequest(t, h, http.MethodGet, "/auth/admin/usage"+query, "caller", "caller@example.org", roles, nil))
	return rec
}

func TestAdminUsage_TechnicalAdminOnly(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	source := &fakeUsage{report: &usage.Report{ByBranch: map[string]int{}}}
	h.usage = source

	// Covering the whole organization is not the same thing as being the
	// technical admin: telemetry is about the software, not the organization.
	for _, roles := range [][]string{
		{authz.RoleWSKOAdmin},
		{authz.FederationAdmin("SE")},
		{authz.BranchAdmin("karlstad")},
		nil,
	} {
		if rec := usageAs(t, h, roles, "?days=30&bin=day"); rec.Code != http.StatusForbidden {
			t.Errorf("%v: status = %d, want 403", roles, rec.Code)
		}
	}
	if len(source.asked) != 0 {
		t.Errorf("a refused caller reached the source: %v", source.asked)
	}

	if rec := usageAs(t, h, []string{authz.RoleAdmin}, "?days=30&bin=day"); rec.Code != http.StatusOK {
		t.Errorf("admin: status = %d, want 200", rec.Code)
	}
}

func TestAdminUsage_RequiresASession(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	h.usage = &fakeUsage{}

	rec := httptest.NewRecorder()
	h.adminUsage(rec, httptest.NewRequest(http.MethodGet, "/auth/admin/usage?days=30&bin=day", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
}

func TestAdminUsage_RejectsParametersOffTheList(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	source := &fakeUsage{}
	h.usage = source
	admin := []string{authz.RoleAdmin}

	for _, query := range []string{"", "?days=30", "?days=abc&bin=day", "?days=0&bin=day", "?days=9999&bin=day", "?days=30&bin=hour"} {
		if rec := usageAs(t, h, admin, query); rec.Code != http.StatusBadRequest {
			t.Errorf("%q: status = %d, want 400", query, rec.Code)
		}
	}
	if len(source.asked) != 0 {
		t.Errorf("an invalid query reached the source: %v", source.asked)
	}
}

func TestAdminUsage_NotConfigured(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})

	if rec := usageAs(t, h, []string{authz.RoleAdmin}, "?days=30&bin=day"); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", rec.Code)
	}
}

func TestAdminUsage_NamesTheBranchesItMentions(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedOrganization(t, h)
	source := &fakeUsage{report: &usage.Report{
		From:    time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC),
		Bin:     usage.BinWeek,
		People:  6,
		Buckets: []usage.Bucket{{People: 6, ByBranch: map[string]int{"karlstad": 3, "tokyo": 1, "gone": 1, "": 1}}},
		// "gone" is a branch deleted since; the empty key is events with no branch.
		ByBranch: map[string]int{"karlstad": 3, "tokyo": 1, "gone": 1, "": 1},
	}}
	h.usage = source

	rec := usageAs(t, h, []string{authz.RoleAdmin}, "?days=60&bin=week")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if len(source.asked) != 1 || source.asked[0] != (usage.Query{Days: 60, Bin: usage.BinWeek}) {
		t.Errorf("asked %v", source.asked)
	}

	var got struct {
		People   int            `json:"people"`
		ByBranch map[string]int `json:"byBranch"`
		Buckets  []usage.Bucket `json:"buckets"`
		Branches []publicBranch `json:"branches"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.People != 6 || got.ByBranch["karlstad"] != 3 || len(got.Buckets) != 1 {
		t.Errorf("report did not come through: %+v", got)
	}

	names := map[string]publicBranch{}
	for _, b := range got.Branches {
		names[b.ID] = b
	}
	if len(names) != 2 {
		t.Errorf("branches = %+v, want karlstad and tokyo only", got.Branches)
	}
	if k := names["karlstad"]; k.Name != "Karlstad" || k.FederationID != "SE" || k.FederationName != "Svenska Shorinji Kempoförbundet" {
		t.Errorf("karlstad = %+v", k)
	}
	if tk := names["tokyo"]; tk.Name != "Tokyo" || tk.FederationID != "" || tk.FederationName != "" {
		t.Errorf("tokyo = %+v, want a WSKO branch with no federation", tk)
	}
}

func TestAdminUsage_AzureRefusal(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	h.usage = &fakeUsage{err: usage.ErrNotPermitted}

	if rec := usageAs(t, h, []string{authz.RoleAdmin}, "?days=30&bin=day"); rec.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", rec.Code)
	}

	h.usage = &fakeUsage{err: errors.New("timeout")}
	if rec := usageAs(t, h, []string{authz.RoleAdmin}, "?days=30&bin=day"); rec.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", rec.Code)
	}
}
