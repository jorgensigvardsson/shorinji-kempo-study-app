package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/ratelimit"
)

func TestSubmitFeedback_RequiresAuth(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/auth/feedback", strings.NewReader(`{"message":"hello"}`))
	h.submitFeedback(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestSubmitFeedback_EmptyMessage(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedUser(t, h, &store.User{ID: "u1", Email: "u1@example.org", DisplayName: "Kenshi"})

	req := authedRequest(t, h, http.MethodPost, "/auth/feedback", "u1", "u1@example.org", nil, map[string]string{"message": "   "})
	rec := httptest.NewRecorder()
	h.submitFeedback(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestSubmitFeedback_TooLong(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedUser(t, h, &store.User{ID: "u1", Email: "u1@example.org", DisplayName: "Kenshi"})

	req := authedRequest(t, h, http.MethodPost, "/auth/feedback", "u1", "u1@example.org", nil,
		map[string]string{"message": strings.Repeat("x", feedbackMaxLen+1)})
	rec := httptest.NewRecorder()
	h.submitFeedback(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestSubmitFeedback_Success(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedUser(t, h, &store.User{ID: "u1", Email: "kenshi@example.org", DisplayName: "Kenshi"})

	req := authedRequest(t, h, http.MethodPost, "/auth/feedback", "u1", "kenshi@example.org", nil,
		map[string]string{"message": "  Great app!  "})
	rec := httptest.NewRecorder()
	h.submitFeedback(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if sender.feedbackSubmission.Message != "Great app!" {
		t.Errorf("feedback message = %q, want trimmed %q", sender.feedbackSubmission.Message, "Great app!")
	}
	if sender.feedbackSubmission.SubmitterName != "Kenshi" || sender.feedbackSubmission.SubmitterEmail != "kenshi@example.org" {
		t.Errorf("submitter = %q <%s>, want Kenshi <kenshi@example.org>", sender.feedbackSubmission.SubmitterName, sender.feedbackSubmission.SubmitterEmail)
	}
	if len(sender.feedbackTo) != 1 || sender.feedbackTo[0] != defaultFeedbackRecipients[0] {
		t.Errorf("recipients = %v, want %v", sender.feedbackTo, defaultFeedbackRecipients)
	}
}

// A user with no display name (e.g. straight from email-code sign-in without a
// name yet) falls back to their email as the submitter name.
func TestSubmitFeedback_FallsBackToEmailWhenNoDisplayName(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedUser(t, h, &store.User{ID: "u1", Email: "noname@example.org"})

	req := authedRequest(t, h, http.MethodPost, "/auth/feedback", "u1", "noname@example.org", nil,
		map[string]string{"message": "feedback"})
	rec := httptest.NewRecorder()
	h.submitFeedback(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if sender.feedbackSubmission.SubmitterName != "noname@example.org" {
		t.Errorf("submitter name = %q, want fallback to email", sender.feedbackSubmission.SubmitterName)
	}
}

// Language and app version come from the request body; user agent comes from
// the request itself (the client can't spoof it independently of the
// connection actually making the call). All three are best-effort context, so
// missing/unset values fall back to "unknown" rather than failing the request.
func TestSubmitFeedback_IncludesContextFields(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedUser(t, h, &store.User{ID: "u1", Email: "u1@example.org", DisplayName: "Kenshi"})

	req := authedRequest(t, h, http.MethodPost, "/auth/feedback", "u1", "u1@example.org", nil,
		map[string]string{"message": "feedback", "language": "SV", "appVersion": "abc1234"})
	req.Header.Set("User-Agent", "TestAgent/1.0")
	rec := httptest.NewRecorder()
	h.submitFeedback(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	sub := sender.feedbackSubmission
	if sub.Language != "sv" {
		t.Errorf("language = %q, want normalized sv", sub.Language)
	}
	if sub.AppVersion != "abc1234" {
		t.Errorf("appVersion = %q, want abc1234", sub.AppVersion)
	}
	if sub.UserAgent != "TestAgent/1.0" {
		t.Errorf("userAgent = %q, want TestAgent/1.0", sub.UserAgent)
	}
}

func TestSubmitFeedback_ContextFieldsDefaultToUnknown(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedUser(t, h, &store.User{ID: "u1", Email: "u1@example.org", DisplayName: "Kenshi"})

	req := authedRequest(t, h, http.MethodPost, "/auth/feedback", "u1", "u1@example.org", nil,
		map[string]string{"message": "feedback"})
	req.Header.Del("User-Agent")
	rec := httptest.NewRecorder()
	h.submitFeedback(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	sub := sender.feedbackSubmission
	if sub.AppVersion != "unknown" {
		t.Errorf("appVersion = %q, want unknown", sub.AppVersion)
	}
	if sub.UserAgent != "unknown" {
		t.Errorf("userAgent = %q, want unknown", sub.UserAgent)
	}
	// Language falls back to "en" via normalizeLang, same as email/start.
	if sub.Language != "en" {
		t.Errorf("language = %q, want en", sub.Language)
	}
}

func TestSubmitFeedback_MailerError(t *testing.T) {
	sender := &fakeSender{feedbackErr: errBoom}
	h := newTestHandler(t, sender)
	seedUser(t, h, &store.User{ID: "u1", Email: "u1@example.org"})

	req := authedRequest(t, h, http.MethodPost, "/auth/feedback", "u1", "u1@example.org", nil,
		map[string]string{"message": "feedback"})
	rec := httptest.NewRecorder()
	h.submitFeedback(rec, req)

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
}

func TestSubmitFeedback_NoRecipientsConfigured(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	h.feedbackRecipients = nil
	seedUser(t, h, &store.User{ID: "u1", Email: "u1@example.org"})

	req := authedRequest(t, h, http.MethodPost, "/auth/feedback", "u1", "u1@example.org", nil,
		map[string]string{"message": "feedback"})
	rec := httptest.NewRecorder()
	h.submitFeedback(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}

func TestSubmitFeedback_RateLimited(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})
	seedUser(t, h, &store.User{ID: "u1", Email: "u1@example.org"})
	// Exhaust a tight global limiter (burst 1) directly, bypassing the handler's
	// own (much larger) production limiter.
	limited := ratelimit.NewGlobal(0, 1).Middleware(http.HandlerFunc(h.submitFeedback))

	newReq := func() *http.Request {
		return authedRequest(t, h, http.MethodPost, "/auth/feedback", "u1", "u1@example.org", nil,
			map[string]string{"message": "feedback"})
	}

	rec1 := httptest.NewRecorder()
	limited.ServeHTTP(rec1, newReq())
	if rec1.Code != http.StatusNoContent {
		t.Fatalf("first request status = %d, want 204", rec1.Code)
	}

	rec2 := httptest.NewRecorder()
	limited.ServeHTTP(rec2, newReq())
	if rec2.Code != http.StatusTooManyRequests {
		t.Fatalf("second request status = %d, want 429", rec2.Code)
	}
}

var errBoom = &boomError{}

type boomError struct{}

func (*boomError) Error() string { return "boom" }
