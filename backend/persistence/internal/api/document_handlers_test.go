package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/store"
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
// A build that does not recognise a field drops it, and syncing that back deletes it
// for every one of the user's devices. Service workers keep old builds alive well past
// a release, so the server is the only place this can be enforced.

func schemaHeaders(version string, extra map[string]string) map[string]string {
	headers := map[string]string{schemaVersionHeader: version}
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

func TestPutDocument_OlderSchemaThanStored_Rejected(t *testing.T) {
	h := newDocumentHandler(t)
	first := putDocument(h, "user-1", `{"version":1,"data":{}}`, schemaHeaders("2", map[string]string{"If-None-Match": "*"}))
	if first.Code != http.StatusOK {
		t.Fatalf("schema-2 write: got %d, want 200", first.Code)
	}

	rec := putDocument(h, "user-1", `{"version":1,"data":{}}`, schemaHeaders("1", map[string]string{"If-Match": first.Header().Get("ETag")}))
	if rec.Code != http.StatusConflict {
		t.Fatalf("schema-1 write over schema-2 document: got %d, want 409", rec.Code)
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

func TestPutDocument_SameOrNewerSchema_Accepted(t *testing.T) {
	h := newDocumentHandler(t)
	first := putDocument(h, "user-1", `{"version":1,"data":{}}`, schemaHeaders("2", map[string]string{"If-None-Match": "*"}))

	same := putDocument(h, "user-1", `{"version":2,"data":{}}`, schemaHeaders("2", map[string]string{"If-Match": first.Header().Get("ETag")}))
	if same.Code != http.StatusOK {
		t.Fatalf("same schema: got %d, want 200", same.Code)
	}

	newer := putDocument(h, "user-1", `{"version":3,"data":{}}`, schemaHeaders("3", map[string]string{"If-Match": same.Header().Get("ETag")}))
	if newer.Code != http.StatusOK {
		t.Fatalf("newer schema: got %d, want 200", newer.Code)
	}
	if got := storedSchema(t, h, "user-1"); got != 3 {
		t.Errorf("stored schema %d, want 3", got)
	}
}

// Until a release actually starts writing a newer shape, every client is at the
// legacy version and the gate must be invisible.
func TestPutDocument_NoSchemaHeader_TreatedAsLegacyAndAccepted(t *testing.T) {
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
	putDocument(h, "user-1", `{"version":1,"data":{}}`, schemaHeaders("2", map[string]string{"If-None-Match": "*"}))

	if rec := putDocument(h, "user-1", `{"version":9,"data":{}}`, nil); rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409", rec.Code)
	}
}

func TestPutDocument_UnreadableSchemaHeader_TreatedAsLegacy(t *testing.T) {
	h := newDocumentHandler(t)
	putDocument(h, "user-1", `{"version":1,"data":{}}`, schemaHeaders("2", map[string]string{"If-None-Match": "*"}))

	for _, header := range []string{"", "banana", "-3", "2.5"} {
		rec := putDocument(h, "user-1", `{"version":9,"data":{}}`, schemaHeaders(header, nil))
		if rec.Code != http.StatusConflict {
			t.Errorf("header %q: got %d, want 409 — an unreadable header is not a claim to understand anything", header, rec.Code)
		}
	}
}

// The body is a document the client may have just read from the server, so a schema
// version inside it proves nothing about what the client understands.
func TestPutDocument_SchemaVersionInBody_Ignored(t *testing.T) {
	h := newDocumentHandler(t)
	putDocument(h, "user-1", `{"version":1,"data":{}}`, schemaHeaders("2", map[string]string{"If-None-Match": "*"}))

	rec := putDocument(h, "user-1", `{"version":9,"schemaVersion":99,"data":{}}`, schemaHeaders("1", nil))
	if rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409 — the body must not be able to claim a schema version", rec.Code)
	}
	if got := storedSchema(t, h, "user-1"); got != 2 {
		t.Errorf("stored schema %d, want 2", got)
	}
}

func TestPutDocument_FirstWriteRecordsDeclaredSchema(t *testing.T) {
	h := newDocumentHandler(t)
	if rec := putDocument(h, "user-1", `{"version":1,"data":{}}`, schemaHeaders("4", map[string]string{"If-None-Match": "*"})); rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	if got := storedSchema(t, h, "user-1"); got != 4 {
		t.Errorf("stored schema %d, want 4", got)
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
