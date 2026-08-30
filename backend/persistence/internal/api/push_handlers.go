package api

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/authclient"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/push"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/store"
)

// browserSubscription mirrors the JSON a browser's PushManager produces.
type browserSubscription struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

// publicKey hands the VAPID public key to the client so it can subscribe.
func (h *Handler) publicKey(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.Write([]byte(h.pushSender.PublicKey()))
}

// subscribe upserts a push subscription for the signed-in user. Callers reach it
// through authMiddleware, so the user ID is always in the request context.
func (h *Handler) subscribe(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 4<<10) // subscriptions are tiny
	var body browserSubscription
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if body.Endpoint == "" || body.Keys.P256dh == "" || body.Keys.Auth == "" {
		http.Error(w, "missing subscription fields", http.StatusBadRequest)
		return
	}

	now := push.NowRFC3339()
	sub := &store.PushSubscription{
		Endpoint:   body.Endpoint,
		P256dh:     body.Keys.P256dh,
		Auth:       body.Keys.Auth,
		UserID:     userID,
		CreatedAt:  now,
		LastSeenAt: now,
	}
	if err := h.pushStore.SaveSubscription(sub); err != nil {
		log.Printf("push subscribe: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// unsubscribe removes a subscription by endpoint.
func (h *Handler) unsubscribe(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4<<10)
	var body struct {
		Endpoint string `json:"endpoint"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Endpoint == "" {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if err := h.pushStore.DeleteSubscription(body.Endpoint); err != nil {
		log.Printf("push unsubscribe: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// audienceScope is the wire shape of one entry in a broadcast's audience list
// — {kind, id} — exactly as authz.Scope encodes on the auth side.
type audienceScope struct {
	Kind string `json:"kind"`
	ID   string `json:"id,omitempty"`
}

func (s audienceScope) isWSKOOnly() bool { return s.Kind == "wsko" && s.ID == "" }

// broadcastRequest is the body POST /push/broadcast accepts. An omitted or
// empty audience means everybody — the CI deploy announcement relies on this
// (PUSH-AUDIENCE-PLAN.md §3.1) and must keep working with no change to it.
type broadcastRequest struct {
	push.Payload
	Audience []audienceScope `json:"audience,omitempty"`
}

// broadcast sends a notification to whoever the audience resolves to,
// defaulting to everybody. See resolveAudience for the two ways a caller may
// be authorized. This is also the send path that announces e.g. a new app
// version, via the PUSH_ADMIN_TOKEN path with no audience field at all.
func (h *Handler) broadcast(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var payload broadcastRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || payload.Title == "" {
		http.Error(w, "invalid JSON (title required)", http.StatusBadRequest)
		return
	}
	audience := payload.Audience
	if len(audience) == 0 {
		audience = []audienceScope{{Kind: "wsko"}}
	}

	subs, ok := h.resolveAudience(w, r, audience)
	if !ok {
		return
	}

	res := h.pushSender.Broadcast(subs, payload.Payload, h.pushStore, log.Printf)
	log.Printf("push broadcast: sent=%d pruned=%d failed=%d", res.Sent, res.Pruned, res.Failed)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

// resolveAudience authorizes the request and returns who it reaches. Two
// paths, matching PUSH-AUDIENCE-PLAN.md §3.1 and §5:
//
//   - PUSH_ADMIN_TOKEN bearer: no identity to check a scope against, so it may
//     only ever mean everybody. Naming anything narrower is refused rather than
//     honoured, even though "everybody" is the larger power.
//   - a signed-in user's access_token cookie: forwarded to auth, which
//     authorizes every entry against the caller's own roles and answers either
//     "everybody" or exactly who is covered.
//
// Both write their own response on failure and return ok=false.
func (h *Handler) resolveAudience(w http.ResponseWriter, r *http.Request, audience []audienceScope) ([]*store.PushSubscription, bool) {
	if token, ok := bearerToken(r); ok && h.pushAdminToken != "" && subtle.ConstantTimeCompare([]byte(token), []byte(h.pushAdminToken)) == 1 {
		for _, s := range audience {
			if !s.isWSKOOnly() {
				http.Error(w, "the shared push token may only send to everybody", http.StatusForbidden)
				return nil, false
			}
		}
		subs, err := h.pushStore.ListSubscriptions()
		if err != nil {
			log.Printf("push broadcast list: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return nil, false
		}
		return subs, true
	}

	cookie, err := r.Cookie("access_token")
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return nil, false
	}
	if h.audienceClient == nil {
		// Configured with no way to resolve a scoped send — the frontend
		// should never offer one without this being set up, so this is a
		// misconfiguration, not a normal refusal.
		http.Error(w, "scoped push audiences are not configured", http.StatusServiceUnavailable)
		return nil, false
	}

	scopes := make([]authclient.Scope, len(audience))
	for i, s := range audience {
		scopes[i] = authclient.Scope{Kind: s.Kind, ID: s.ID}
	}
	result, status, err := h.audienceClient.ResolveAudience(r.Context(), cookie.Value, scopes)
	if err != nil {
		if errors.Is(err, authclient.ErrUnavailable) {
			http.Error(w, "auth service unavailable", http.StatusServiceUnavailable)
		} else {
			log.Printf("push audience resolve: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
		}
		return nil, false
	}
	if status != http.StatusOK {
		http.Error(w, "audience refused", status)
		return nil, false
	}

	var subs []*store.PushSubscription
	if result.All {
		subs, err = h.pushStore.ListSubscriptions()
	} else {
		subs, err = h.pushStore.ListSubscriptionsForUsers(result.UserIDs)
	}
	if err != nil {
		log.Printf("push broadcast list: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil, false
	}
	return subs, true
}

// bearerToken extracts the Authorization: Bearer <token> header, if present.
func bearerToken(r *http.Request) (string, bool) {
	header := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return "", false
	}
	return strings.TrimPrefix(header, prefix), true
}

// authorizeAdmin allows the request when the caller is a signed-in user with the
// "admin" role, or presents the PUSH_ADMIN_TOKEN as a bearer token.
func (h *Handler) authorizeAdmin(r *http.Request) bool {
	if hasRole(h.jwks, h.issuerURL, r, "admin") {
		return true
	}
	if h.pushAdminToken == "" {
		return false // no shared token configured ⇒ only the admin role works
	}
	token, ok := bearerToken(r)
	return ok && subtle.ConstantTimeCompare([]byte(token), []byte(h.pushAdminToken)) == 1
}
