package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/authclient"
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

	// audienceClient resolves a scoped push audience against the auth service,
	// forwarding the caller's own access_token cookie. Nil means a cookie-based
	// broadcast cannot be scoped — see resolveAudience in push_handlers.go.
	audienceClient audienceResolver

	// The split-item store the document is migrating to. Nil means the migration is
	// not enabled and nothing is written to it.
	userData store.UserDataStore

	// Which of the two the API reads from and checks preconditions against. Flipping
	// it is the migration step: the other store keeps receiving copies either way, so
	// whichever is not being read stays current as the way back.
	readFromUserData bool
}

// documentStore is a store the API can be pointed at. Both the original store and the
// split-item one satisfy it, which is what lets the migration be a matter of swapping
// which is read from rather than a second path through every handler.
type documentStore interface {
	Load(userID string) (*store.Document, string, error)
	Save(userID string, doc *store.Document, ifMatch string) (string, error)
	SaveUnconditional(userID string, doc *store.Document) (string, error)
	Delete(userID string) error
}

// WithUserDataShadow starts writing every accepted document to the split-item store as
// well, without reading from it.
//
// Writing both for a while is what makes the move safe: the split runs against real
// documents, at real volume, with the old container still authoritative, so a mistake
// in it costs nothing and can be fixed and backfilled rather than recovered from.
func (h *Handler) WithUserDataShadow(s store.UserDataStore) *Handler {
	h.userData = s
	return h
}

// WithUserDataReads serves reads from the split-item store, and checks write
// preconditions against it. The original container keeps receiving every accepted
// document, so turning this back off is a restart rather than a deploy.
//
// Only meaningful once the split store holds every user: see the backfill.
func (h *Handler) WithUserDataReads() *Handler {
	h.readFromUserData = true
	return h
}

// primary is the store being read from, and the one a write's precondition is checked
// against. shadow is the other one, which receives a copy of every accepted write and
// is nil when the migration is not enabled.
func (h *Handler) primary() documentStore {
	if h.readFromUserData && h.userData != nil {
		return h.userData
	}
	return h.store
}

func (h *Handler) shadow() documentStore {
	if h.userData == nil {
		return nil
	}
	if h.readFromUserData {
		return h.store
	}
	return h.userData
}

func NewHandler(s store.Store, ks KeySource, frontendURL, issuerURL string, limiter *ratelimit.IPRateLimiter) *Handler {
	return &Handler{store: s, jwks: ks, frontendURL: frontendURL, issuerURL: issuerURL, limiter: limiter}
}

// audienceResolver resolves a push audience against the auth service.
// *authclient.Client implements it; tests use a stub so they don't need a real
// auth service listening.
type audienceResolver interface {
	ResolveAudience(ctx context.Context, accessToken string, audience []authclient.Scope) (*authclient.Result, int, error)
}

// WithPush enables the push-notification endpoints. Call before Register.
// audienceClient may be nil, in which case a cookie-authorized (as opposed to
// PUSH_ADMIN_TOKEN-authorized) broadcast cannot be resolved and is refused.
func (h *Handler) WithPush(ps store.PushStore, sender *push.Sender, adminToken string, audienceClient audienceResolver) *Handler {
	h.pushStore = ps
	h.pushSender = sender
	h.pushAdminToken = adminToken
	h.audienceClient = audienceClient
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
	// drop its own endpoint, even after the session is gone; broadcast resolves
	// and authorizes its audience inside the handler — see resolveAudience in
	// push_handlers.go.
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
	doc, etag, err := h.loadDocument(userID)
	if err != nil {
		log.Printf("load document(%s): %v", userID, err)
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
	// The backfill only ever copies the original container into the split one. Once
	// reads have moved, that direction is backwards: it would overwrite every user's
	// current document with the rollback copy. Refuse rather than offer a footgun —
	// after the switch, dual-write is what keeps the other store current.
	if h.readFromUserData {
		http.Error(w, "reads already come from the split store; backfilling now would overwrite current data with the rollback copy", http.StatusConflict)
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

// loadDocument reads from whichever store is being read from, and heals a gap if it
// finds one.
//
// A document present in the store not being read from, but missing from the one that
// is, means a write slipped through: shadow-write failures are logged and swallowed on
// purpose, and the backfill only covers users up to the moment it ran. Serving a 404
// there would look exactly like a user losing everything.
//
// So it is copied across and served. Healing rather than merely falling back matters
// for the precondition: the ETag handed out has to be one the next write can be
// checked against, and that has to come from the store doing the checking.
func (h *Handler) loadDocument(userID string) (*store.Document, string, error) {
	doc, etag, err := h.primary().Load(userID)
	if err != nil || doc != nil {
		return doc, etag, err
	}

	shadow := h.shadow()
	if shadow == nil {
		return nil, "", nil
	}
	fallback, _, err := shadow.Load(userID)
	if err != nil || fallback == nil {
		// Nothing anywhere, which is a genuine 404. An error reading the store we do
		// not read from is not worth failing the request over.
		return nil, "", nil
	}

	log.Printf("healing %s: found in the store not being read from, copying across", userID)
	healedEtag, err := h.primary().SaveUnconditional(userID, fallback)
	if err != nil {
		// Serve it anyway — the user's data is more important than the copy. Without
		// an ETag the client's next write carries no precondition and is treated as a
		// legacy unconditional write, which is the old behaviour rather than a loss.
		log.Printf("healing %s failed, serving from the other store without an ETag: %v", userID, err)
		return fallback, "", nil
	}
	return fallback, healedEtag, nil
}

// shadowWrite copies an already-accepted document into whichever store is not being
// read from — the one being filled before the switch, or the one kept current as the
// way back after it.
//
// Failures are logged and swallowed on purpose. Nothing reads that store, so a failure
// costs a backfill, whereas failing the request would let a store no user depends on
// take syncing down for everyone. What it does cost is that a gap can open up, which
// is why loadDocument heals one when it finds it.
func (h *Handler) shadowWrite(userID string, doc *store.Document) {
	shadow := h.shadow()
	if shadow == nil {
		return
	}
	// Unconditional: the primary store has already accepted and ordered this write, so
	// a second concurrency check here would only reject writes that never conflicted.
	if _, err := shadow.SaveUnconditional(userID, doc); err != nil {
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
	current, _, err := h.primary().Load(userID)
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
		return h.primary().Save(userID, doc, ifMatch)
	}
	if r.Header.Get("If-None-Match") == "*" {
		return h.primary().Save(userID, doc, "")
	}
	return h.primary().SaveUnconditional(userID, doc)
}

func (h *Handler) deleteAccount(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if err := h.primary().Delete(userID); err != nil {
		log.Printf("primary Delete(%s): %v", userID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	// Deleting an account has to clear both stores, or the copy would outlive the
	// account it belongs to — and once loadDocument heals from the other store, a copy
	// left behind would come back. Unlike a shadow write, a failure here leaves data
	// after someone asked for it to be gone, so it is reported rather than logged.
	if shadow := h.shadow(); shadow != nil {
		if err := shadow.Delete(userID); err != nil {
			log.Printf("shadow Delete(%s): %v", userID, err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}
