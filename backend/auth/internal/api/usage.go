package api

import (
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/usage"
)

// usageResponse is the report with the branches it mentions resolved to names,
// so the page can label and group them without fetching the tree as well. A
// branch that has since been deleted is simply absent here, and the page labels
// its id as unknown rather than dropping its people from the count.
type usageResponse struct {
	*usage.Report
	Branches []publicBranch `json:"branches"`
}

// adminUsage reports how many people have used the app over time, overall and
// per branch, read from the app's own telemetry (see the usage package).
//
// It is for the technical admin alone, and that is decided by holding the role
// itself rather than by covering a scope. Telemetry is not a fact about the
// organization — it is a fact about the software, alongside broadcasts and
// force-logout — so it sits beside authz.Covers the way granting `admin` does,
// not inside it. A WSKO admin covers every branch and still does not see this.
func (h *Handler) adminUsage(w http.ResponseWriter, r *http.Request) {
	claims, err := h.claimsFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if !containsRole(claims.Roles, authz.RoleAdmin) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if h.usage == nil {
		// Local development, or an environment deployed without Application
		// Insights. Not a fault, so not a 500.
		http.Error(w, "usage statistics are not configured", http.StatusServiceUnavailable)
		return
	}

	days, err := strconv.Atoi(r.URL.Query().Get("days"))
	if err != nil {
		http.Error(w, "days must be a number", http.StatusBadRequest)
		return
	}
	q := usage.Query{Days: days, Bin: usage.Bin(r.URL.Query().Get("bin"))}
	if err := q.Validate(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	report, err := h.usage.Usage(r.Context(), q)
	if err != nil {
		log.Printf("adminUsage: %v", err)
		if errors.Is(err, usage.ErrNotPermitted) {
			// Worth its own message: straight after the first deploy this is the
			// role assignment still propagating, and it clears up by itself.
			http.Error(w, "the service may not read telemetry yet", http.StatusBadGateway)
			return
		}
		http.Error(w, "could not read usage statistics", http.StatusBadGateway)
		return
	}

	writeJSON(w, usageResponse{Report: report, Branches: h.namedBranches(report)})
}

// namedBranches resolves every branch id the report mentions. The window totals
// name every branch that appears in any bucket, so they are the only place that
// needs reading.
func (h *Handler) namedBranches(report *usage.Report) []publicBranch {
	out := []publicBranch{}
	for id := range report.ByBranch {
		b, ok := h.orgs.Branch(id)
		if !ok {
			continue
		}
		entry := publicBranch{ID: b.ID, Name: b.Name, FederationID: b.FederationID}
		if fed, ok := h.orgs.Federation(b.FederationID); ok {
			entry.FederationName = fed.Name
		}
		out = append(out, entry)
	}
	return out
}
