package api

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
)

// pushAudienceRequest is the wire shape persistence posts: the scopes named by
// whoever is composing a push notification, straight off the frontend picker.
type pushAudienceRequest struct {
	Audience []authz.Scope `json:"audience"`
}

// pushAudienceResponse tells persistence how to fetch the subscriptions: every
// one of them (All), or exactly the subscribers of UserIDs.
type pushAudienceResponse struct {
	All     bool     `json:"all,omitempty"`
	UserIDs []string `json:"userIds,omitempty"`
}

// adminPushAudience resolves a push audience into the user ids that should
// receive it, refusing the whole request unless the caller covers every scope
// named — never dropping just the entries that don't (PUSH-AUDIENCE-PLAN.md
// §4: "refuse the whole request, never part of it").
//
// persistence is the only caller, forwarding the sender's own access_token
// cookie, so the scope being enforced is always the caller's own.
func (h *Handler) adminPushAudience(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 4<<10)
	var body pushAudienceRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		// An empty body is a validly omitted audience (defaults below), not a
		// malformed request — only report the ones json can't parse at all.
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	audience := body.Audience
	if len(audience) == 0 {
		audience = []authz.Scope{authz.WSKO()}
	}

	all := false
	seenBranch := map[string]bool{}
	var branchIDs []string
	for _, scope := range audience {
		if !scope.Valid() {
			http.Error(w, "invalid audience entry", http.StatusBadRequest)
			return
		}
		switch scope.Kind {
		case authz.KindWSKO:
			if !h.covers(claims, scope) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			all = true

		case authz.KindFederation:
			if _, ok := h.orgs.Federation(scope.ID); !ok || !h.covers(claims, scope) {
				// Same reasoning as adminBranchMembers: a federation outside the
				// caller's scope is reported exactly like one that doesn't exist,
				// so naming one cannot be used to probe the organization.
				http.Error(w, "federation not found", http.StatusNotFound)
				return
			}
			for _, id := range h.orgs.BranchesIn(scope.ID) {
				if !seenBranch[id] {
					seenBranch[id] = true
					branchIDs = append(branchIDs, id)
				}
			}

		case authz.KindBranch:
			if _, ok := h.orgs.Branch(scope.ID); !ok || !h.covers(claims, scope) {
				http.Error(w, "branch not found", http.StatusNotFound)
				return
			}
			if !seenBranch[scope.ID] {
				seenBranch[scope.ID] = true
				branchIDs = append(branchIDs, scope.ID)
			}
		}
	}

	if all {
		writeJSON(w, pushAudienceResponse{All: true})
		return
	}

	users, err := h.users.ListByBranches(branchIDs)
	if err != nil {
		log.Printf("adminPushAudience: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	userIDs := make([]string, len(users))
	for i, u := range users {
		userIDs[i] = u.ID
	}
	writeJSON(w, pushAudienceResponse{UserIDs: userIDs})
}
