package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/push"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/cors"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/csrf"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/ratelimit"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/secureheaders"
)

type Handler struct {
	store       store.Store
	jwks        KeySource
	frontendURL string
	issuerURL   string
	limiter     *ratelimit.IPRateLimiter

	// Push notifications. Nil sender/store means push is unconfigured and its
	// endpoints are not registered.
	pushStore      store.PushStore
	pushSender     *push.Sender
	pushAdminToken string
}

func NewHandler(s store.Store, ks KeySource, frontendURL, issuerURL string, limiter *ratelimit.IPRateLimiter) *Handler {
	return &Handler{store: s, jwks: ks, frontendURL: frontendURL, issuerURL: issuerURL, limiter: limiter}
}

// WithPush enables the push-notification endpoints. Call before Register.
func (h *Handler) WithPush(ps store.PushStore, sender *push.Sender, adminToken string) *Handler {
	h.pushStore = ps
	h.pushSender = sender
	h.pushAdminToken = adminToken
	return h
}

func (h *Handler) Register(mux *http.ServeMux) {
	inner := http.NewServeMux()
	inner.HandleFunc("GET /healthz", h.healthz)
	inner.Handle("GET /api/v1/document", authMiddleware(h.jwks, h.issuerURL, http.HandlerFunc(h.getDocument)))
	inner.Handle("PUT /api/v1/document", authMiddleware(h.jwks, h.issuerURL, http.HandlerFunc(h.putDocument)))
	inner.Handle("DELETE /api/v1/account", authMiddleware(h.jwks, h.issuerURL, http.HandlerFunc(h.deleteAccount)))

	// Web Push — only when configured. subscribe/unsubscribe accept anonymous
	// callers; broadcast is guarded by a bearer token inside the handler.
	if h.pushSender != nil && h.pushStore != nil {
		inner.HandleFunc("GET /push/public-key", h.publicKey)
		inner.HandleFunc("POST /push/subscribe", h.subscribe)
		inner.HandleFunc("POST /push/unsubscribe", h.unsubscribe)
		inner.HandleFunc("POST /push/broadcast", h.broadcast)
	}

	mux.Handle("/", secureheaders.Middleware(cors.Middleware(h.frontendURL, csrf.Middleware(h.frontendURL, h.limiter.Middleware(inner)))))
}

func (h *Handler) healthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func (h *Handler) getDocument(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	doc, err := h.store.Load(userID)
	if err != nil {
		log.Printf("store.Load(%s): %v", userID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if doc == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(doc)
}

func (h *Handler) putDocument(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MB — Cosmos hard-limits items to 2 MB
	var doc store.Document
	if err := json.NewDecoder(r.Body).Decode(&doc); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
		} else {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
		}
		return
	}
	if err := h.store.Save(userID, &doc); err != nil {
		log.Printf("store.Save(%s): %v", userID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(doc)
}

func (h *Handler) deleteAccount(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if err := h.store.Delete(userID); err != nil {
		log.Printf("store.Delete(%s): %v", userID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
