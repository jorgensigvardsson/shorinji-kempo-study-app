package api

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/email"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/token"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/ratelimit"
)

// fakeSender records the last code it was asked to send (the plaintext the
// handler generated), which the tests use to drive the verify step. It also
// records the last feedback submission relayed through it.
type fakeSender struct {
	to, code, lang string
	err            error

	feedbackTo         []string
	feedbackSubmission email.FeedbackSubmission
	feedbackErr        error
}

func (f *fakeSender) SendVerificationCode(_ context.Context, to, code, lang string) error {
	f.to, f.code, f.lang = to, code, lang
	return f.err
}

func (f *fakeSender) SendFeedback(_ context.Context, to []string, submission email.FeedbackSubmission) error {
	f.feedbackTo = to
	f.feedbackSubmission = submission
	return f.feedbackErr
}

// defaultFeedbackRecipients is the recipient list newTestHandler wires up so
// tests exercising POST /auth/feedback don't need a dedicated constructor.
var defaultFeedbackRecipients = []string{"maintainer@example.test"}

func newTestHandler(t *testing.T, sender *fakeSender) *Handler {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	dir := t.TempDir()
	return NewHandler(
		nil, // providers unused by the email flow
		map[string]string{"gmail.com": "google"},
		store.NewFileUserStore(dir),
		store.NewFileRefreshTokenStore(dir),
		store.NewFileRoleStore(dir),
		token.NewManager(key, "http://test"),
		sender,
		"http://frontend",
		"",
		ratelimit.New(1000, 1000),
		defaultFeedbackRecipients,
	)
}

func postJSON(t *testing.T, h http.HandlerFunc, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(string(b)))
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func TestEmailStart_OIDCDomainRedirects(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)

	rec := postJSON(t, h.emailStart, "/auth/email/start", map[string]string{"email": "user@gmail.com"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var resp map[string]string
	json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp["action"] != "oidc" || resp["provider"] != "google" {
		t.Fatalf("got %v, want action=oidc provider=google", resp)
	}
	if sender.code != "" {
		t.Fatalf("no email should be sent for an OIDC domain, but sent code %q", sender.code)
	}
}

func TestEmailStart_NewThenExisting(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)

	rec := postJSON(t, h.emailStart, "/auth/email/start", map[string]string{"email": "new@example.org", "language": "sv"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var resp map[string]string
	json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp["action"] != "new" {
		t.Fatalf("action = %q, want new", resp["action"])
	}
	if len(sender.code) != 6 {
		t.Fatalf("expected a 6-digit code, got %q", sender.code)
	}
	if sender.lang != "sv" {
		t.Fatalf("lang = %q, want sv", sender.lang)
	}

	// Verify creates the account; a second start must now report "existing".
	code := sender.code
	vrec := postJSON(t, h.emailVerify, "/auth/email/verify", map[string]string{
		"email": "new@example.org", "code": code, "name": "Test Person",
	})
	if vrec.Code != http.StatusNoContent {
		t.Fatalf("verify status = %d, want 204", vrec.Code)
	}

	rec2 := postJSON(t, h.emailStart, "/auth/email/start", map[string]string{"email": "new@example.org"})
	json.Unmarshal(rec2.Body.Bytes(), &resp)
	if resp["action"] != "existing" {
		t.Fatalf("action = %q, want existing", resp["action"])
	}
}

func TestEmailVerify_CreatesUserWithNameClaim(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)

	postJSON(t, h.emailStart, "/auth/email/start", map[string]string{"email": "alice@example.org"})
	rec := postJSON(t, h.emailVerify, "/auth/email/verify", map[string]string{
		"email": "alice@example.org", "code": sender.code, "name": "Alice Example",
	})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}

	// The stored user has the submitted display name.
	user, err := h.users.FindByLinkedIdentity(emailProviderName, "alice@example.org")
	if err != nil || user == nil {
		t.Fatalf("user lookup: %v (user=%v)", err, user)
	}
	if user.DisplayName != "Alice Example" {
		t.Fatalf("DisplayName = %q, want Alice Example", user.DisplayName)
	}

	// The access token cookie carries the name claim.
	var accessToken string
	for _, c := range rec.Result().Cookies() {
		if c.Name == accessCookieName {
			accessToken = c.Value
		}
	}
	if accessToken == "" {
		t.Fatal("no access_token cookie set")
	}
	claims, err := h.tokens.Verify(accessToken)
	if err != nil {
		t.Fatalf("verify token: %v", err)
	}
	if claims.Name != "Alice Example" {
		t.Fatalf("name claim = %q, want Alice Example", claims.Name)
	}
}

func TestEmailVerify_WrongCode(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)

	postJSON(t, h.emailStart, "/auth/email/start", map[string]string{"email": "bob@example.org"})
	rec := postJSON(t, h.emailVerify, "/auth/email/verify", map[string]string{
		"email": "bob@example.org", "code": "000000", "name": "Bob",
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	var resp map[string]string
	json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp["error"] != "invalid_code" {
		t.Fatalf("error = %q, want invalid_code", resp["error"])
	}
	// No account should have been created.
	if u, _ := h.users.FindByLinkedIdentity(emailProviderName, "bob@example.org"); u != nil {
		t.Fatal("user should not exist after a failed verification")
	}
}

func TestEmailVerify_TooManyAttempts(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	postJSON(t, h.emailStart, "/auth/email/start", map[string]string{"email": "eve@example.org"})

	for i := 0; i < emailCodeMaxTries; i++ {
		postJSON(t, h.emailVerify, "/auth/email/verify", map[string]string{
			"email": "eve@example.org", "code": "111111",
		})
	}
	// The next attempt — even with the right code — is rejected as exhausted.
	rec := postJSON(t, h.emailVerify, "/auth/email/verify", map[string]string{
		"email": "eve@example.org", "code": sender.code,
	})
	var resp map[string]string
	json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp["error"] != "too_many_attempts" {
		t.Fatalf("error = %q, want too_many_attempts", resp["error"])
	}
}

func TestNormalizeLang(t *testing.T) {
	cases := map[string]string{"sv": "sv", "TR": "tr", "ja": "ja", "en": "en", "de": "en", "": "en"}
	for in, want := range cases {
		if got := normalizeLang(in); got != want {
			t.Errorf("normalizeLang(%q) = %q, want %q", in, got, want)
		}
	}
}
