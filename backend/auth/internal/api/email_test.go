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
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/email"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/org"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/token"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/ratelimit"
)

// fakeSender records the last code it was asked to send (the plaintext the
// handler generated), which the tests use to drive the verify step. It also
// records the last feedback submission relayed through it.
type fakeSender struct {
	to, code, lang string
	validFor       time.Duration
	err            error

	feedbackTo         []string
	feedbackSubmission email.FeedbackSubmission
	feedbackErr        error

	// Join-request mail, recorded rather than sent. Who was told is as much a
	// part of the behaviour as what they were told, so both are kept.
	noticeTo     []string
	notice       email.JoinRequestNotice
	receivedTo   string
	receivedLang string
	decisionTo   string
	decisionLang string
	decided      bool // whether a decision mail was sent at all
	approved     bool
	joinErr      error
}

func (f *fakeSender) SendVerificationCode(_ context.Context, to, code, lang string, validFor time.Duration) error {
	f.to, f.code, f.lang, f.validFor = to, code, lang, validFor
	return f.err
}

func (f *fakeSender) SendJoinRequestNotice(_ context.Context, to []string, n email.JoinRequestNotice) error {
	f.noticeTo, f.notice = to, n
	return f.joinErr
}

func (f *fakeSender) SendJoinReceived(_ context.Context, to, branchName, lang string) error {
	f.receivedTo, f.receivedLang = to, lang
	return f.joinErr
}

func (f *fakeSender) SendJoinDecision(_ context.Context, to, branchName, lang string, approved bool) error {
	f.decisionTo, f.decisionLang, f.decided, f.approved = to, lang, true, approved
	return f.joinErr
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
		testOrgTree(t, dir),
		store.NewFileJoinRequestStore(dir),
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

func TestEmailStart_UnknownAddressStaysUnknown(t *testing.T) {
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

	// Verifying proves the address and stops there. No account is created, so a
	// second start still reports "new" — the address stays unknown until a branch
	// admits it.
	vrec := postJSON(t, h.emailVerify, "/auth/email/verify", map[string]string{
		"email": "new@example.org", "code": sender.code, "name": "Test Person",
	})
	if vrec.Code != http.StatusOK {
		t.Fatalf("verify status = %d, want 200", vrec.Code)
	}
	var vresp map[string]string
	json.Unmarshal(vrec.Body.Bytes(), &vresp)
	if vresp["action"] != "join_required" {
		t.Fatalf("verify action = %q, want join_required", vresp["action"])
	}
	if user, _ := h.users.FindByLinkedIdentity(emailProviderName, "new@example.org"); user != nil {
		t.Fatalf("a user was created for an unadmitted address: %+v", user)
	}
	for _, c := range vrec.Result().Cookies() {
		if c.Name == accessCookieName || c.Name == refreshCookieName {
			t.Errorf("verify handed out a %s cookie without an account", c.Name)
		}
	}

	rec2 := postJSON(t, h.emailStart, "/auth/email/start", map[string]string{"email": "new@example.org"})
	json.Unmarshal(rec2.Body.Bytes(), &resp)
	if resp["action"] != "new" {
		t.Fatalf("action = %q, want new — verifying must not have created an account", resp["action"])
	}
}

// What a verified but unadmitted address gets instead of a session: a ticket
// naming the identity that proved the address, so approving the request later
// can link the account to that identity rather than to whatever is typed next.
func TestEmailVerify_UnknownAddressGetsATicketNotAnAccount(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)

	postJSON(t, h.emailStart, "/auth/email/start", map[string]string{"email": "hopeful@example.org"})
	rec := postJSON(t, h.emailVerify, "/auth/email/verify", map[string]string{
		"email": "hopeful@example.org", "code": sender.code, "name": "Hopeful Person",
	})

	var ticketCookie string
	for _, c := range rec.Result().Cookies() {
		if c.Name == joinCookieName {
			ticketCookie = c.Value
		}
	}
	if ticketCookie == "" {
		t.Fatal("no join ticket cookie set")
	}

	ticket, err := h.tokens.VerifyJoinTicket(ticketCookie)
	if err != nil {
		t.Fatalf("verify join ticket: %v", err)
	}
	if ticket.Email != "hopeful@example.org" || ticket.Provider != emailProviderName {
		t.Errorf("ticket = %+v, want the verified address via the email provider", ticket)
	}
	if ticket.Name != "Hopeful Person" {
		t.Errorf("ticket name = %q; the name rides on the ticket, there being no user to store it on", ticket.Name)
	}

	// The same ticket is not a session, however valid it is in its own right.
	if _, err := h.tokens.Verify(ticketCookie); err == nil {
		t.Error("a join ticket verified as an access token")
	}

	// And it is what the registration screen reads its context from.
	creq := httptest.NewRequest(http.MethodGet, "/auth/join/context", nil)
	creq.AddCookie(&http.Cookie{Name: joinCookieName, Value: ticketCookie})
	crec := httptest.NewRecorder()
	h.joinContext(crec, creq)
	if crec.Code != http.StatusOK {
		t.Fatalf("join context status = %d, want 200", crec.Code)
	}
	var ctx map[string]string
	json.Unmarshal(crec.Body.Bytes(), &ctx)
	if ctx["email"] != "hopeful@example.org" || ctx["name"] != "Hopeful Person" {
		t.Errorf("join context = %v", ctx)
	}
}

// Without a ticket there is nothing to say, and the remedy is to verify the
// address again — a sign-in, not a permission.
func TestJoinContext_RequiresATicket(t *testing.T) {
	h := newTestHandler(t, &fakeSender{})

	rec := httptest.NewRecorder()
	h.joinContext(rec, httptest.NewRequest(http.MethodGet, "/auth/join/context", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("no cookie: status = %d, want 401", rec.Code)
	}

	// An access token is not a join ticket either, even for a real user.
	seedUser(t, h, &store.User{ID: "u1", Email: "u1@example.org"})
	access, err := h.tokens.Issue(token.Identity{Subject: "u1", Email: "u1@example.org"})
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, "/auth/join/context", nil)
	req.AddCookie(&http.Cookie{Name: joinCookieName, Value: access})
	rec = httptest.NewRecorder()
	h.joinContext(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("access token as a ticket: status = %d, want 401", rec.Code)
	}
}

// Both places that tell a user how long the code lasts — the sign-in screen, via
// this field, and the email itself, via the mailer — take the duration from the
// TTL that enforces it, so neither can state a number the server won't honour.
func TestEmailStart_ReportsCodeTTL(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)

	rec := postJSON(t, h.emailStart, "/auth/email/start", map[string]string{"email": "ttl@example.org"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var resp struct {
		ExpiresInSeconds int `json:"expires_in_seconds"`
	}
	json.Unmarshal(rec.Body.Bytes(), &resp)
	if want := int(emailCodeTTL.Seconds()); resp.ExpiresInSeconds != want {
		t.Fatalf("expires_in_seconds = %d, want %d", resp.ExpiresInSeconds, want)
	}
	if sender.validFor != emailCodeTTL {
		t.Fatalf("mailer got validFor = %s, want %s", sender.validFor, emailCodeTTL)
	}
}

// An address that already has an account signs in exactly as it always did:
// the admission gate stands in front of enrolment, not in front of login.
func TestEmailVerify_ExistingUserSignsInWithNameClaim(t *testing.T) {
	sender := &fakeSender{}
	h := newTestHandler(t, sender)
	seedUser(t, h, &store.User{
		ID: "u1", Email: "alice@example.org", DisplayName: "Alice Example",
		LinkedIdentities: map[string]store.LinkedIdentity{
			emailProviderName: {Sub: "alice@example.org", Email: "alice@example.org"},
		},
	})

	postJSON(t, h.emailStart, "/auth/email/start", map[string]string{"email": "alice@example.org"})
	rec := postJSON(t, h.emailVerify, "/auth/email/verify", map[string]string{
		"email": "alice@example.org", "code": sender.code,
	})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
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

// testOrgTree gives the handler a real tree backed by the same temp directory,
// so a test that needs a federation with branches under it can simply save them.
func testOrgTree(t *testing.T, dir string) *org.Tree {
	t.Helper()
	tree := org.New(store.NewFileOrgStore(dir))
	if err := tree.Reload(); err != nil {
		t.Fatalf("load org tree: %v", err)
	}
	return tree
}
