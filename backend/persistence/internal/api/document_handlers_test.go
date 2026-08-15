package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/ratelimit"
)

func newDocumentHandler(t *testing.T) *Handler {
	t.Helper()
	return NewHandler(store.NewFileStore(t.TempDir()), nil, "http://frontend", testIssuer, nil)
}

func putDocument(h *Handler, userID, body string, headers map[string]string) *httptest.ResponseRecorder {
	req := asUser(httptest.NewRequest(http.MethodPut, "/api/v1/document", strings.NewReader(body)), userID)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.putDocument(rec, req)
	return rec
}

func getDocument(h *Handler, userID string) *httptest.ResponseRecorder {
	req := asUser(httptest.NewRequest(http.MethodGet, "/api/v1/document", nil), userID)
	rec := httptest.NewRecorder()
	h.getDocument(rec, req)
	return rec
}

func storedVersion(t *testing.T, h *Handler, userID string) int {
	t.Helper()
	rec := getDocument(h, userID)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET: got %d, want 200", rec.Code)
	}
	var doc store.Document
	if err := json.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatalf("decode stored document: %v", err)
	}
	return doc.Version
}

func TestGetDocument_NoDocument_Returns404(t *testing.T) {
	if rec := getDocument(newDocumentHandler(t), "user-1"); rec.Code != http.StatusNotFound {
		t.Fatalf("got %d, want 404", rec.Code)
	}
}

func TestGetDocument_ReturnsETagForTheVersionRead(t *testing.T) {
	h := newDocumentHandler(t)
	put := putDocument(h, "user-1", `{"version":1,"data":{}}`, map[string]string{"If-None-Match": "*"})
	if put.Code != http.StatusOK {
		t.Fatalf("PUT: got %d, want 200", put.Code)
	}

	get := getDocument(h, "user-1")
	if get.Header().Get("ETag") == "" {
		t.Error("GET returned no ETag; the client has no precondition to send back")
	}
	if get.Header().Get("ETag") != put.Header().Get("ETag") {
		t.Errorf("GET ETag %q != PUT ETag %q for the same version",
			get.Header().Get("ETag"), put.Header().Get("ETag"))
	}
}

func TestPutDocument_MatchingIfMatch_Accepted(t *testing.T) {
	h := newDocumentHandler(t)
	first := putDocument(h, "user-1", `{"version":1,"data":{}}`, map[string]string{"If-None-Match": "*"})
	etag := first.Header().Get("ETag")

	second := putDocument(h, "user-1", `{"version":2,"data":{}}`, map[string]string{"If-Match": etag})
	if second.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", second.Code)
	}
	if second.Header().Get("ETag") == etag {
		t.Error("ETag did not change after a write")
	}
	if v := storedVersion(t, h, "user-1"); v != 2 {
		t.Errorf("stored version %d, want 2", v)
	}
}

// The lost update this whole mechanism exists to prevent: two devices read the same
// version, both merge, both write.
func TestPutDocument_StaleIfMatch_Rejected(t *testing.T) {
	h := newDocumentHandler(t)
	first := putDocument(h, "user-1", `{"version":1,"data":{}}`, map[string]string{"If-None-Match": "*"})
	shared := first.Header().Get("ETag")

	if rec := putDocument(h, "user-1", `{"version":2,"data":{}}`, map[string]string{"If-Match": shared}); rec.Code != http.StatusOK {
		t.Fatalf("device B: got %d, want 200", rec.Code)
	}

	rec := putDocument(h, "user-1", `{"version":3,"data":{}}`, map[string]string{"If-Match": shared})
	if rec.Code != http.StatusPreconditionFailed {
		t.Fatalf("device A: got %d, want 412", rec.Code)
	}
	if v := storedVersion(t, h, "user-1"); v != 2 {
		t.Errorf("stored version %d, want 2 — device B's write must survive", v)
	}
}

func TestPutDocument_IfNoneMatchStar_RejectedWhenDocumentExists(t *testing.T) {
	h := newDocumentHandler(t)
	if rec := putDocument(h, "user-1", `{"version":1,"data":{}}`, map[string]string{"If-None-Match": "*"}); rec.Code != http.StatusOK {
		t.Fatalf("first: got %d, want 200", rec.Code)
	}

	rec := putDocument(h, "user-1", `{"version":99,"data":{}}`, map[string]string{"If-None-Match": "*"})
	if rec.Code != http.StatusPreconditionFailed {
		t.Fatalf("got %d, want 412", rec.Code)
	}
	if v := storedVersion(t, h, "user-1"); v != 1 {
		t.Errorf("stored version %d, want 1", v)
	}
}

// App versions predating optimistic concurrency send no precondition. They keep the
// old last-write-wins behaviour rather than losing the ability to sync at all.
func TestPutDocument_NoPrecondition_OverwritesUnconditionally(t *testing.T) {
	h := newDocumentHandler(t)
	if rec := putDocument(h, "user-1", `{"version":1,"data":{}}`, nil); rec.Code != http.StatusOK {
		t.Fatalf("first: got %d, want 200", rec.Code)
	}
	if rec := putDocument(h, "user-1", `{"version":2,"data":{}}`, nil); rec.Code != http.StatusOK {
		t.Fatalf("second: got %d, want 200", rec.Code)
	}
	if v := storedVersion(t, h, "user-1"); v != 2 {
		t.Errorf("stored version %d, want 2", v)
	}
}

// ─── schema gate ────────────────────────────────────────────────────────────────
//
// A build that drops fields it does not recognise deletes them for every one of the
// user's devices as soon as it syncs. Service workers keep old builds alive well past
// a release, so the server is the only place this can be caught.
//
// A client declares two separate things, and the distinction is the point: the shape
// it writes, and the highest shape it can hold without dropping anything. Only the
// second decides whether a write is safe.

// clientBuild describes a client by what it writes and what it can hold. An empty
// string means the header is absent — a build from before these existed.
func clientBuild(writes, compat string, extra map[string]string) map[string]string {
	headers := map[string]string{}
	if writes != "" {
		headers[schemaVersionHeader] = writes
	}
	if compat != "" {
		headers[schemaCompatHeader] = compat
	}
	for k, v := range extra {
		headers[k] = v
	}
	return headers
}

func storedSchema(t *testing.T, h *Handler, userID string) int {
	t.Helper()
	version, err := h.storedSchemaVersion(userID)
	if err != nil {
		t.Fatalf("storedSchemaVersion: %v", err)
	}
	return version
}

func storedDocument(t *testing.T, h *Handler, userID string) *store.Document {
	t.Helper()
	doc, _, err := h.store.Load(userID)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if doc == nil {
		t.Fatal("no stored document")
	}
	return doc
}

// Seeds a schema-2 document, written by a build that both writes and holds 2.
func seedSchema2(t *testing.T, h *Handler) string {
	t.Helper()
	rec := putDocument(h, "user-1", `{"version":1,"data":{}}`, clientBuild("2", "2", map[string]string{"If-None-Match": "*"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("seed schema-2 write: got %d, want 200", rec.Code)
	}
	return rec.Header().Get("ETag")
}

func TestPutDocument_CompatBelowStoredSchema_Rejected(t *testing.T) {
	h := newDocumentHandler(t)
	etag := seedSchema2(t, h)

	rec := putDocument(h, "user-1", `{"version":1,"data":{}}`, clientBuild("1", "1", map[string]string{"If-Match": etag}))
	if rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409", rec.Code)
	}

	var body struct {
		Error                 string `json:"error"`
		RequiredSchemaVersion int    `json:"requiredSchemaVersion"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if body.Error != schemaTooOldError {
		t.Errorf("error = %q, want %q", body.Error, schemaTooOldError)
	}
	if body.RequiredSchemaVersion != 2 {
		t.Errorf("requiredSchemaVersion = %d, want 2", body.RequiredSchemaVersion)
	}
	if got := storedSchema(t, h, "user-1"); got != 2 {
		t.Errorf("stored schema %d, want 2 — the rejected write must not have downgraded it", got)
	}
}

// The reason the two declarations are separate. This build writes the old shape but
// carries unrecognised fields through, so it cannot lose the schema-2 data and must
// keep syncing right through the rollout rather than being locked out for being old.
func TestPutDocument_OlderShapeButAdequateCompat_Accepted(t *testing.T) {
	h := newDocumentHandler(t)
	etag := seedSchema2(t, h)

	rec := putDocument(h, "user-1", `{"version":1,"data":{}}`, clientBuild("1", "2", map[string]string{"If-Match": etag}))
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200 — a build that preserves what it cannot read is safe", rec.Code)
	}
	if got := storedSchema(t, h, "user-1"); got != 1 {
		t.Errorf("stored schema %d, want 1 — the document was rewritten in the older shape", got)
	}
}

func TestPutDocument_SameOrNewerCompat_Accepted(t *testing.T) {
	h := newDocumentHandler(t)
	etag := seedSchema2(t, h)

	same := putDocument(h, "user-1", `{"version":2,"data":{}}`, clientBuild("2", "2", map[string]string{"If-Match": etag}))
	if same.Code != http.StatusOK {
		t.Fatalf("same compat: got %d, want 200", same.Code)
	}

	newer := putDocument(h, "user-1", `{"version":3,"data":{}}`, clientBuild("3", "4", map[string]string{"If-Match": same.Header().Get("ETag")}))
	if newer.Code != http.StatusOK {
		t.Fatalf("newer compat: got %d, want 200", newer.Code)
	}
	if got := storedSchema(t, h, "user-1"); got != 3 {
		t.Errorf("stored schema %d, want 3", got)
	}
}

// Until a release actually writes a newer shape, every client is at the legacy version
// and the gate must be invisible.
func TestPutDocument_NoHeaders_TreatedAsLegacyAndAccepted(t *testing.T) {
	h := newDocumentHandler(t)
	if rec := putDocument(h, "user-1", `{"version":1,"data":{}}`, map[string]string{"If-None-Match": "*"}); rec.Code != http.StatusOK {
		t.Fatalf("first headerless write: got %d, want 200", rec.Code)
	}
	if rec := putDocument(h, "user-1", `{"version":2,"data":{}}`, nil); rec.Code != http.StatusOK {
		t.Fatalf("second headerless write: got %d, want 200", rec.Code)
	}
	if got := storedSchema(t, h, "user-1"); got != legacySchemaVersion {
		t.Errorf("stored schema %d, want %d", got, legacySchemaVersion)
	}
}

func TestPutDocument_HeaderlessWriteOverNewerSchema_Rejected(t *testing.T) {
	h := newDocumentHandler(t)
	seedSchema2(t, h)

	if rec := putDocument(h, "user-1", `{"version":9,"data":{}}`, nil); rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409", rec.Code)
	}
}

func TestPutDocument_UnreadableHeaders_TreatedAsLegacy(t *testing.T) {
	h := newDocumentHandler(t)
	seedSchema2(t, h)

	for _, compat := range []string{"", "banana", "-3", "2.5"} {
		rec := putDocument(h, "user-1", `{"version":9,"data":{}}`, clientBuild("9", compat, nil))
		if rec.Code != http.StatusConflict {
			t.Errorf("compat header %q: got %d, want 409 — an unreadable header is not a claim to handle anything", compat, rec.Code)
		}
	}
}

// The body is a document the client may have just read from the server, so versions
// inside it prove nothing about what the client can actually handle.
func TestPutDocument_VersionsInBody_Ignored(t *testing.T) {
	h := newDocumentHandler(t)
	seedSchema2(t, h)

	rec := putDocument(h, "user-1", `{"version":9,"schemaVersion":99,"clientCompat":99,"data":{}}`, clientBuild("1", "1", nil))
	if rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409 — the body must not be able to claim a version", rec.Code)
	}
	if got := storedSchema(t, h, "user-1"); got != 2 {
		t.Errorf("stored schema %d, want 2", got)
	}
}

func TestPutDocument_RecordsBothDeclarationsForCounting(t *testing.T) {
	h := newDocumentHandler(t)
	if rec := putDocument(h, "user-1", `{"version":1,"data":{}}`, clientBuild("3", "4", map[string]string{"If-None-Match": "*"})); rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}

	// Recorded so the spread of client builds can be counted from the data, which is
	// what says whether a schema change is safe to make yet.
	doc := storedDocument(t, h, "user-1")
	if doc.SchemaVersion != 3 {
		t.Errorf("SchemaVersion = %d, want 3", doc.SchemaVersion)
	}
	if doc.ClientCompat != 4 {
		t.Errorf("ClientCompat = %d, want 4", doc.ClientCompat)
	}
}

func TestPutDocument_LegacyClientRecordedAsLegacyCompat(t *testing.T) {
	h := newDocumentHandler(t)
	putDocument(h, "user-1", `{"version":1,"data":{}}`, map[string]string{"If-None-Match": "*"})

	if got := storedDocument(t, h, "user-1").ClientCompat; got != legacySchemaVersion {
		t.Errorf("ClientCompat = %d, want %d — a build with no header claims only its own shape", got, legacySchemaVersion)
	}
}
// ─── shadow writes to the split-item store ──────────────────────────────────────
//
// Every accepted document is also written split by field, to fill the container that
// will replace the current one. Nothing reads it yet, which is the point: the split
// runs against real documents while the old store is still authoritative, so a mistake
// in it costs a backfill rather than data.

// failingUserDataStore stands in for the split store being broken or unreachable.
type failingUserDataStore struct{ calls int }

func (s *failingUserDataStore) SaveUnconditional(string, *store.Document) (string, error) {
	s.calls++
	return "", errors.New("shadow store unavailable")
}
func (s *failingUserDataStore) Save(string, *store.Document, string) (string, error) {
	s.calls++
	return "", errors.New("shadow store unavailable")
}
func (s *failingUserDataStore) Load(string) (*store.Document, string, error) { return nil, "", nil }
func (s *failingUserDataStore) Delete(string) error {
	return errors.New("shadow store unavailable")
}

func newShadowingHandler(t *testing.T) (*Handler, store.UserDataStore) {
	t.Helper()
	shadow := store.NewFileUserDataStore(t.TempDir())
	h := NewHandler(store.NewFileStore(t.TempDir()), nil, "http://frontend", testIssuer, nil).WithUserDataShadow(shadow)
	return h, shadow
}

func TestPutDocument_AcceptedWriteIsAlsoWrittenSplit(t *testing.T) {
	h, shadow := newShadowingHandler(t)
	body := `{"version":1,"data":{"grade":"nidan","notes":{"kote nage":"hold the elbow"}}}`

	if rec := putDocument(h, "user-1", body, clientBuild("1", "2", map[string]string{"If-None-Match": "*"})); rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}

	got, _, err := shadow.Load("user-1")
	if err != nil {
		t.Fatalf("shadow Load: %v", err)
	}
	if got == nil {
		t.Fatal("the accepted document was not written to the split store")
	}
	var data struct {
		Grade string            `json:"grade"`
		Notes map[string]string `json:"notes"`
	}
	if err := json.Unmarshal(got.Data, &data); err != nil {
		t.Fatalf("unmarshal shadow data: %v", err)
	}
	if data.Grade != "nidan" || data.Notes["kote nage"] != "hold the elbow" {
		t.Errorf("shadow document lost content: %+v", data)
	}
}

// A rejected write must not reach the split store, or it would hold a version the
// authoritative store refused.
func TestPutDocument_RejectedWriteIsNotShadowed(t *testing.T) {
	h, shadow := newShadowingHandler(t)
	putDocument(h, "user-1", `{"version":1,"data":{"a":1}}`, clientBuild("2", "2", map[string]string{"If-None-Match": "*"}))

	// Refused: this client cannot hold the stored schema.
	if rec := putDocument(h, "user-1", `{"version":99,"data":{"a":99}}`, clientBuild("1", "1", nil)); rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409", rec.Code)
	}

	got, _, _ := shadow.Load("user-1")
	if got == nil {
		t.Fatal("expected the first document to still be there")
	}
	if got.Version != 1 {
		t.Errorf("shadow version %d, want 1 — the refused write must not have been shadowed", got.Version)
	}
}

// The whole reason shadow failures are swallowed: a store nothing reads must not be
// able to take syncing down.
func TestPutDocument_ShadowFailureDoesNotFailTheRequest(t *testing.T) {
	shadow := &failingUserDataStore{}
	h := NewHandler(store.NewFileStore(t.TempDir()), nil, "http://frontend", testIssuer, nil).WithUserDataShadow(shadow)

	rec := putDocument(h, "user-1", `{"version":1,"data":{"a":1}}`, clientBuild("1", "2", map[string]string{"If-None-Match": "*"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200 — a failing shadow store must not break syncing", rec.Code)
	}
	if shadow.calls != 1 {
		t.Errorf("shadow Save called %d times, want 1", shadow.calls)
	}
	if storedVersion(t, h, "user-1") != 1 {
		t.Error("the authoritative write should have landed regardless")
	}
}

func TestPutDocument_NoShadowStore_StillWorks(t *testing.T) {
	h := newDocumentHandler(t) // no WithUserDataShadow
	if rec := putDocument(h, "user-1", `{"version":1,"data":{"a":1}}`, clientBuild("1", "2", map[string]string{"If-None-Match": "*"})); rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
}

func TestDeleteAccount_ClearsBothStores(t *testing.T) {
	h, shadow := newShadowingHandler(t)
	putDocument(h, "user-1", `{"version":1,"data":{"a":1}}`, clientBuild("1", "2", map[string]string{"If-None-Match": "*"}))

	req := asUser(httptest.NewRequest(http.MethodDelete, "/api/v1/account", nil), "user-1")
	rec := httptest.NewRecorder()
	h.deleteAccount(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204", rec.Code)
	}

	if got, _, _ := shadow.Load("user-1"); got != nil {
		t.Error("the split store still holds data for a deleted account")
	}
	if rec := getDocument(h, "user-1"); rec.Code != http.StatusNotFound {
		t.Errorf("GET after delete: got %d, want 404", rec.Code)
	}
}

// Unlike a shadow write, failing to delete leaves data behind after someone asked for
// it to be gone. That has to be reported, not swallowed.
func TestDeleteAccount_ShadowDeleteFailureIsReported(t *testing.T) {
	h := NewHandler(store.NewFileStore(t.TempDir()), nil, "http://frontend", testIssuer, nil).
		WithUserDataShadow(&failingUserDataStore{})

	req := asUser(httptest.NewRequest(http.MethodDelete, "/api/v1/account", nil), "user-1")
	rec := httptest.NewRecorder()
	h.deleteAccount(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("got %d, want 500", rec.Code)
	}
}

// ─── backfill ───────────────────────────────────────────────────────────────────

func postBackfill(h *Handler, admin bool) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/userdata-backfill", nil)
	if admin {
		req = asUser(req, "admin-user")
		req.Header.Set("Authorization", "Bearer "+testBackfillAdminToken)
	}
	rec := httptest.NewRecorder()
	h.backfillUserData(rec, req)
	return rec
}

const testBackfillAdminToken = "backfill-admin-token"

func newBackfillHandler(t *testing.T) (*Handler, store.Store, store.UserDataStore) {
	t.Helper()
	dir := t.TempDir()
	source := store.NewFileStore(dir)
	shadow := store.NewFileUserDataStore(dir)
	h := NewHandler(source, nil, "http://frontend", testIssuer, nil).
		WithUserDataShadow(shadow)
	h.pushAdminToken = testBackfillAdminToken
	return h, source, shadow
}

func TestBackfillEndpoint_CopiesUsersThatNeverSynced(t *testing.T) {
	h, source, shadow := newBackfillHandler(t)

	// Written straight to the authoritative store, as a user who has not synced since
	// shadow writes began would appear.
	for _, id := range []string{"quiet-1", "quiet-2"} {
		if _, err := source.Save(id, &store.Document{Version: 1, UpdatedAt: "2026-08-01T00:00:00Z", Data: json.RawMessage(`{"grade":"shodan"}`)}, ""); err != nil {
			t.Fatalf("seed %s: %v", id, err)
		}
	}

	rec := postBackfill(h, true)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	var result store.BackfillResult
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode result: %v", err)
	}
	if result.Total != 2 || result.Copied != 2 {
		t.Errorf("got %+v, want 2 total / 2 copied", result)
	}

	for _, id := range []string{"quiet-1", "quiet-2"} {
		got, _, err := shadow.Load(id)
		if err != nil || got == nil {
			t.Errorf("%s was not backfilled (err %v)", id, err)
		}
	}
}

func TestBackfillEndpoint_RequiresAdmin(t *testing.T) {
	h, _, _ := newBackfillHandler(t)
	if rec := postBackfill(h, false); rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestBackfillEndpoint_NotRegisteredWithoutShadowStore(t *testing.T) {
	// No WithUserDataShadow: there is nothing to back fill into, so the route should
	// not exist rather than answer.
	h := NewHandler(store.NewFileStore(t.TempDir()), nil, "http://frontend", testIssuer, ratelimit.New(100, 100))
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/userdata-backfill", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code == http.StatusOK {
		t.Errorf("got %d, want the route to be absent", rec.Code)
	}
}

// And if it is somehow reached without a shadow store, it says so rather than panicking.
func TestBackfillEndpoint_WithoutShadowStore_ReportsUnavailable(t *testing.T) {
	h := NewHandler(store.NewFileStore(t.TempDir()), nil, "http://frontend", testIssuer, nil)
	h.pushAdminToken = testBackfillAdminToken

	if rec := postBackfill(h, true); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d, want 503", rec.Code)
	}
}

func TestPutDocument_Unauthenticated_Returns401(t *testing.T) {
	h := newDocumentHandler(t)
	req := httptest.NewRequest(http.MethodPut, "/api/v1/document", strings.NewReader(`{"version":1}`))
	rec := httptest.NewRecorder()
	h.putDocument(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestPutDocument_OversizedBody_Returns413(t *testing.T) {
	h := newDocumentHandler(t)
	body := `{"version":1,"data":{"padding":"` + strings.Repeat("x", 1<<20) + `"}}`
	rec := putDocument(h, "user-1", body, map[string]string{"If-None-Match": "*"})
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("got %d, want 413", rec.Code)
	}
}
