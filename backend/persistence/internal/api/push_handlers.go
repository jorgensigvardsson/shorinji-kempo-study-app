package api

import (
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"strings"

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

// subscribe upserts a push subscription. It accepts anonymous callers; when a
// valid access_token cookie is present the subscription is tagged with the user.
func (h *Handler) subscribe(w http.ResponseWriter, r *http.Request) {
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
		UserID:     optionalUserID(h.jwks, h.issuerURL, r),
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

// broadcast sends a notification to every stored subscription. Authorized either
// by a signed-in user holding the "admin" role (the web UI) or by the
// PUSH_ADMIN_TOKEN bearer token (scripts/CI) — this is the send path that
// announces e.g. a new app version.
func (h *Handler) broadcast(w http.ResponseWriter, r *http.Request) {
	if !h.authorizeAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var payload push.Payload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || payload.Title == "" {
		http.Error(w, "invalid JSON (title required)", http.StatusBadRequest)
		return
	}

	subs, err := h.pushStore.ListSubscriptions()
	if err != nil {
		log.Printf("push broadcast list: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	res := h.pushSender.Broadcast(subs, payload, h.pushStore, log.Printf)
	log.Printf("push broadcast: sent=%d pruned=%d failed=%d", res.Sent, res.Pruned, res.Failed)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
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
	header := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return false
	}
	token := strings.TrimPrefix(header, prefix)
	return subtle.ConstantTimeCompare([]byte(token), []byte(h.pushAdminToken)) == 1
}
