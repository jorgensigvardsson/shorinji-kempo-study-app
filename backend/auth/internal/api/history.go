package api

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
)

// record writes one event to the usage history, best-effort.
//
// Best-effort because the thing it records has already happened: an account
// that exists must not be undone because the line saying so could not be
// written, and Cosmos has no transaction spanning two containers to make the two
// writes one. A failure is logged and the history has a gap, which for counts
// over months is the lesser harm.
//
// Nothing identifying goes in — see store/history.go. Callers pass branch ids
// and kinds, never a user id or an address.
//
// A nil store means history is switched off in this environment (staging), and
// recording is a no-op.
func (h *Handler) record(e store.HistoryEntry) {
	if h.history == nil {
		return
	}
	if e.ID == "" {
		id, err := store.NewUUID()
		if err != nil {
			log.Printf("history: record %s: id: %v", e.Type, err)
			return
		}
		e.ID = id
	}
	if e.At == "" {
		e.At = time.Now().UTC().Format(time.RFC3339)
	}
	if err := h.history.Append(&e); err != nil {
		log.Printf("history: record %s: %v", e.Type, err)
	}
}

// lifetimeBucket says how long an account existed, coarsely: coarse enough that
// a deletion cannot be matched to a person by its date of creation, fine enough
// to see whether people leave in their first month or after years.
func lifetimeBucket(createdAt string, now time.Time) string {
	created, err := time.Parse(time.RFC3339, createdAt)
	if err != nil {
		return "unknown"
	}
	switch age := now.Sub(created); {
	case age < 30*24*time.Hour:
		return "<1m"
	case age < 182*24*time.Hour:
		return "1-6m"
	case age < 365*24*time.Hour:
		return "6-12m"
	case age < 730*24*time.Hour:
		return "1-2y"
	default:
		return "2y+"
	}
}

// historyResponse is everything the usage page needs to draw the long view:
// the entries recorded since its cursor, and the names of every branch, which
// are not cached with the entries because a branch can be renamed.
type historyResponse struct {
	Items    []*store.HistoryEntry `json:"items"`
	Branches []publicBranch        `json:"branches"`
}

// adminUsageHistory returns the usage history recorded at or after `since` — all
// of it when absent. The page keeps what it has already fetched and asks only
// for what is newer; entries never change, so that is safe to do forever.
//
// Technical admin only, for the same reason as adminUsage.
func (h *Handler) adminUsageHistory(w http.ResponseWriter, r *http.Request) {
	claims, err := h.claimsFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if !containsRole(claims.Roles, authz.RoleAdmin) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if h.history == nil {
		http.Error(w, "usage history is not configured", http.StatusServiceUnavailable)
		return
	}

	// Reformatted rather than passed through: the Cosmos store compares the
	// cursor as text against fixed-width stamps, and "…12:00:00Z" sorts after
	// "…12:00:00.000000Z", which would skip everything recorded in that second.
	since := strings.TrimSpace(r.URL.Query().Get("since"))
	if since != "" {
		t, err := time.Parse(time.RFC3339, since)
		if err != nil {
			http.Error(w, "since must be an RFC 3339 time", http.StatusBadRequest)
			return
		}
		since = t.UTC().Format(store.RecordedAtFormat)
	}

	items, err := h.history.Since(since)
	if err != nil {
		log.Printf("adminUsageHistory: %v", err)
		http.Error(w, "could not read usage history", http.StatusInternalServerError)
		return
	}
	if items == nil {
		items = []*store.HistoryEntry{}
	}

	branches := h.orgs.Branches()
	named := make([]publicBranch, 0, len(branches))
	for _, b := range branches {
		entry := publicBranch{ID: b.ID, Name: b.Name, FederationID: b.FederationID}
		if fed, ok := h.orgs.Federation(b.FederationID); ok {
			entry.FederationName = fed.Name
		}
		named = append(named, entry)
	}
	writeJSON(w, historyResponse{Items: items, Branches: named})
}
