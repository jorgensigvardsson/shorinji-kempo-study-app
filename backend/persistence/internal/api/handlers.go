package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

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

	// Web Push — only when configured. subscribe requires a signed-in user (the
	// app has no anonymous mode); unsubscribe stays open so a device can always
	// drop its own endpoint, even after the session is gone; broadcast is guarded
	// by a bearer token or the admin role inside the handler.
	if h.pushSender != nil && h.pushStore != nil {
		inner.HandleFunc("GET /push/public-key", h.publicKey)
		inner.Handle("POST /push/subscribe", authMiddleware(h.jwks, h.issuerURL, http.HandlerFunc(h.subscribe)))
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
	doc, etag, err := h.store.Load(userID)
	if err != nil {
		log.Printf("store.Load(%s): %v", userID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if doc == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	// The client sends this back as If-Match on the PUT that follows, so its merge
	// is rejected if anything else wrote in between.
	if etag != "" {
		w.Header().Set("ETag", etag)
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
	// Refuse the write outright if this client is too old to preserve what is stored,
	// before any of it can be overwritten by a document missing fields.
	declared := declaredSchemaVersion(r)
	stored, err := h.storedSchemaVersion(userID)
	if err != nil {
		log.Printf("store.Load(%s): %v", userID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if declared < stored {
		log.Printf("rejected write for %s: client schema %d, stored schema %d", userID, declared, stored)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]any{
			"error":                 schemaTooOldError,
			"requiredSchemaVersion": stored,
		})
		return
	}
	doc.SchemaVersion = declared

	etag, err := h.saveDocument(userID, &doc, r)
	if errors.Is(err, store.ErrPreconditionFailed) {
		// Another device wrote since this one read. Its merge was computed against a
		// document that is no longer current, so the client has to read, merge and
		// retry rather than have this write silently replace the other device's.
		http.Error(w, "document changed since it was read", http.StatusPreconditionFailed)
		return
	}
	if err != nil {
		log.Printf("store.Save(%s): %v", userID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if etag != "" {
		w.Header().Set("ETag", etag)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(doc)
}

// schemaVersionHeader is how a client states which shape of the document it
// understands. It is deliberately not part of the request body: the body is a
// document the client may have just read from the server, so anything in it could be
// echoed back by a client that does not actually understand it.
const schemaVersionHeader = "X-App-Schema-Version"

// legacySchemaVersion is what a request without the header is taken to declare — the
// shape those builds write. They must keep syncing until a later schema actually
// arrives, so until one does, this check changes nothing for anybody.
const legacySchemaVersion = 1

// schemaTooOldError is the machine-readable reason in a 409 body, so the client can
// tell "your app is too old" apart from any other conflict and say so plainly rather
// than retrying a write that can never succeed.
const schemaTooOldError = "schema_too_old"

func declaredSchemaVersion(r *http.Request) int {
	raw := r.Header.Get(schemaVersionHeader)
	if raw == "" {
		return legacySchemaVersion
	}
	version, err := strconv.Atoi(raw)
	if err != nil || version < 0 {
		// An unreadable header is not a claim to understand anything newer.
		return legacySchemaVersion
	}
	return version
}

// storedSchemaVersion reports the shape the stored document was last written in.
// Costs a point read on each write; a sync writes rarely enough for that to be a fair
// price for not letting a stale client delete data it cannot see.
func (h *Handler) storedSchemaVersion(userID string) (int, error) {
	current, _, err := h.store.Load(userID)
	if err != nil {
		return 0, err
	}
	if current == nil {
		return 0, nil // nothing stored yet, so nothing to protect
	}
	if current.SchemaVersion == 0 {
		return legacySchemaVersion, nil // written before this field existed
	}
	return current.SchemaVersion, nil
}

// saveDocument picks the concurrency check from the request's preconditions.
//
//	If-Match: <etag>   the client merged into that exact version
//	If-None-Match: *   the client believes it is creating the first document
//	neither            an app version predating optimistic concurrency
//
// The unconditional case is what installed clients did before this existed, and a
// service worker can keep one of those around for a while after a release. Rejecting
// them would break sync on those devices, so they keep the old last-write-wins
// behaviour and stop racing as soon as they update.
func (h *Handler) saveDocument(userID string, doc *store.Document, r *http.Request) (string, error) {
	if ifMatch := r.Header.Get("If-Match"); ifMatch != "" {
		return h.store.Save(userID, doc, ifMatch)
	}
	if r.Header.Get("If-None-Match") == "*" {
		return h.store.Save(userID, doc, "")
	}
	return h.store.SaveUnconditional(userID, doc)
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
