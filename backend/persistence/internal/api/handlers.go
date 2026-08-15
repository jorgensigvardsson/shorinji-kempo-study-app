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

	// The split-item store the document is migrating to. While it is being filled it
	// is written but never read, and `store` above stays the source of truth. Nil
	// means the migration is not enabled and nothing shadow-writes.
	userData store.UserDataStore
}

// WithUserDataShadow starts writing every accepted document to the split-item store as
// well, without reading from it. Call before Register.
//
// Writing both for a while is what makes the move safe: the split runs against real
// documents, at real volume, with the old container still authoritative, so a mistake
// in it costs nothing and can be fixed and backfilled rather than recovered from.
func (h *Handler) WithUserDataShadow(s store.UserDataStore) *Handler {
	h.userData = s
	return h
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

	// Only registered while the split store is being filled. Admin-guarded and run on
	// purpose: it scans every document, which the container it reads is not built for.
	if h.userData != nil {
		inner.HandleFunc("POST /api/v1/admin/userdata-backfill", h.backfillUserData)
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
	// Refuse the write outright if this client cannot hold what is already stored,
	// before any of it can be overwritten by a document missing fields.
	compat := declaredCompatVersion(r)
	stored, err := h.storedSchemaVersion(userID)
	if err != nil {
		log.Printf("store.Load(%s): %v", userID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if compat < stored {
		log.Printf("rejected write for %s: client compat %d, stored schema %d", userID, compat, stored)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]any{
			"error":                 schemaTooOldError,
			"requiredSchemaVersion": stored,
		})
		return
	}

	// Not a rejection — this write is safe — but worth knowing about. Builds that
	// predate the compatibility header cannot be told apart from ones that predate
	// preserving unknown fields, so this over-reports rather than under-reports,
	// which is the right direction to be wrong in.
	if compat < currentCompatVersion {
		log.Printf("outdated client wrote for %s: compat %d, current %d", userID, compat, currentCompatVersion)
	}

	doc.SchemaVersion = declaredSchemaVersion(r)
	doc.ClientCompat = compat

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
	h.shadowWrite(userID, &doc)

	if etag != "" {
		w.Header().Set("ETag", etag)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(doc)
}

// backfillUserData copies every stored document into the split-item store, covering
// the users shadow writes never reach because they have not synced since it started.
//
// Admin-guarded and synchronous: it is a rare, deliberate operation, and the caller
// wanting the summary is the point. If it ever grows past what one request can hold,
// it should become a job rather than lose its report.
func (h *Handler) backfillUserData(w http.ResponseWriter, r *http.Request) {
	if !h.authorizeAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if h.userData == nil {
		http.Error(w, "user data shadow writes are not enabled", http.StatusServiceUnavailable)
		return
	}

	result, err := store.BackfillUserData(h.store, h.userData, log.Printf)
	if err != nil {
		log.Printf("userdata backfill: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// shadowWrite copies an already-accepted document into the split-item store.
//
// Failures are logged and swallowed on purpose. Nothing reads that store yet, so a
// failure here costs a backfill, whereas failing the request would let a bug in a
// store no user depends on take syncing down for everyone. The trade flips once reads
// move across, and this becomes part of the write that has to succeed.
func (h *Handler) shadowWrite(userID string, doc *store.Document) {
	if h.userData == nil {
		return
	}
	if err := h.userData.Save(userID, doc); err != nil {
		log.Printf("shadow write failed for %s: %v", userID, err)
	}
}

// A client states two separate things about itself, and conflating them is what makes
// a schema rollout either unsafe or needlessly disruptive:
//
//	X-App-Schema-Version  which shape it writes, recorded against the document
//	X-App-Schema-Compat   the highest shape it can hold without dropping anything
//
// Only the second decides whether a write is safe. A build that writes an older shape
// but carries unrecognised fields through is harmless and keeps syncing; a build that
// drops them is refused. Declaring only the first cannot tell those apart.
//
// Both are headers rather than body fields on purpose: the body is a document the
// client may have just read from the server, so anything in it could be echoed back
// by a client that understands none of it.
const (
	schemaVersionHeader = "X-App-Schema-Version"
	schemaCompatHeader  = "X-App-Schema-Compat"
)

// legacySchemaVersion is what a request missing either header is taken to declare.
// Builds from before these headers existed dropped whatever they did not recognise,
// so they can claim no more than the shape they themselves write.
const legacySchemaVersion = 1

// currentCompatVersion is the compatibility version of the client shipped alongside
// this server. A write declaring less came from an older build; logging those is how
// we know whether any build predating the safety work is still out there, without
// having to refuse anything to find out. The line stops appearing once they are gone.
const currentCompatVersion = 2

// schemaTooOldError is the machine-readable reason in a 409 body, so the client can
// tell "your app is too old" apart from any other conflict and say so plainly rather
// than retrying a write that can never succeed.
const schemaTooOldError = "schema_too_old"

func headerVersion(r *http.Request, name string) int {
	raw := r.Header.Get(name)
	if raw == "" {
		return legacySchemaVersion
	}
	version, err := strconv.Atoi(raw)
	if err != nil || version < 0 {
		// An unreadable header is not a claim to handle anything newer.
		return legacySchemaVersion
	}
	return version
}

func declaredSchemaVersion(r *http.Request) int { return headerVersion(r, schemaVersionHeader) }
func declaredCompatVersion(r *http.Request) int { return headerVersion(r, schemaCompatHeader) }

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
	// Deleting an account has to clear both stores, or the copy would outlive the
	// account it belongs to. Unlike a shadow write, a failure here leaves data behind
	// after someone asked for it to be gone, so it is reported rather than logged.
	if h.userData != nil {
		if err := h.userData.Delete(userID); err != nil {
			log.Printf("userData.Delete(%s): %v", userID, err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}
