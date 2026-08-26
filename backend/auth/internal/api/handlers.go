package api

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/email"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/org"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/provider"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/token"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/cors"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/csrf"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/ratelimit"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/secureheaders"
)

const (
	accessCookieName  = "access_token"
	refreshCookieName = "refresh_token"
	txnCookieName     = "oauth_txn"
	stateTTL          = 10 * time.Minute

	// emailProviderName is the linked-identity key for email (code) login. Unlike
	// OIDC providers there is no OAuth round-trip, so it has no provider.Provider.
	emailProviderName = "email"
	emailCodeTTL      = 10 * time.Minute
	emailCodeMaxTries = 5
)

// emailCode is a pending verification code, held in memory like OIDC pending
// state (the auth service runs a single replica).
type emailCode struct {
	codeHash  [32]byte
	expiresAt time.Time
	attempts  int
}

type pendingState struct {
	nonce        string
	providerName string
	expiresAt    time.Time
	linkUserID   string // non-empty → identity-link flow; this user gets the new identity added
	txnID        string // H1: random value mirrored as a browser cookie to bind the flow to the initiating browser
}

type Handler struct {
	providers          map[string]provider.Provider // provider name → provider
	domains            map[string]string            // email domain → provider name
	users              store.UserStore
	refreshTokens      store.RefreshTokenStore
	roles              store.RoleStore
	orgs               *org.Tree // the organization tree; required, never nil
	joinRequests       store.JoinRequestStore
	tokens             *token.Manager
	mailer             email.Sender
	frontendURL        string
	cookieDomain       string
	limiter            *ratelimit.IPRateLimiter
	emailLimiter       *ratelimit.GlobalRateLimiter // global cap on code-sending (protects the email quota)
	feedbackRecipients []string                     // where POST /auth/feedback is relayed; empty disables the endpoint
	feedbackLimiter    *ratelimit.GlobalRateLimiter // global cap on feedback-sending (protects the email quota)
	joinLimiter        *ratelimit.GlobalRateLimiter // global cap on join requests (protects admins' inboxes as much as the quota)
	mu                 sync.Mutex
	pending            map[string]pendingState
	emailCodes         map[string]emailCode // lowercased email → pending code
}

func NewHandler(
	providers map[string]provider.Provider,
	domains map[string]string,
	users store.UserStore,
	refreshTokens store.RefreshTokenStore,
	roles store.RoleStore,
	orgs *org.Tree,
	joinRequests store.JoinRequestStore,
	tokens *token.Manager,
	mailer email.Sender,
	frontendURL string,
	cookieDomain string,
	limiter *ratelimit.IPRateLimiter,
	feedbackRecipients []string,
) *Handler {
	h := &Handler{
		providers:     providers,
		domains:       domains,
		users:         users,
		refreshTokens: refreshTokens,
		roles:         roles,
		orgs:          orgs,
		joinRequests:  joinRequests,
		tokens:        tokens,
		mailer:        mailer,
		frontendURL:   frontendURL,
		cookieDomain:  cookieDomain,
		limiter:       limiter,
		// Hard product requirement: at most one verification email every 5 s,
		// globally, to protect the provider quota and the developer's wallet.
		emailLimiter:       ratelimit.NewGlobal(0.2, 1),
		feedbackRecipients: feedbackRecipients,
		// Feedback is user-triggered but still a real SMTP send; cap it well
		// below the verification-code limit since it's not latency-sensitive.
		feedbackLimiter: ratelimit.NewGlobal(0.1, 2),
		// Joining is a once-in-a-lifetime act per person, so this can be slower
		// still than feedback: roughly one every twenty seconds, with a little
		// slack for a club signing up together after a session.
		joinLimiter: ratelimit.NewGlobal(0.05, 3),
		pending:     make(map[string]pendingState),
		emailCodes:  make(map[string]emailCode),
	}
	go h.sweepExpiredStates()
	return h
}

// identityFor assembles everything a token says about a user at the moment it
// is minted: their roles, their branch, and the federation that branch belongs
// to. Both places that issue a token go through here, so the two cannot drift
// apart — which they would, silently, since a token missing a claim looks
// exactly like a user who has nothing to put in it.
func (h *Handler) identityFor(user *store.User, family string) token.Identity {
	return token.Identity{
		Subject:    user.ID,
		Email:      user.Email,
		Name:       user.DisplayName,
		Roles:      h.rolesFor(user.Email),
		Family:     family,
		Branch:     user.BranchID,
		Federation: h.orgs.FederationOf(user.BranchID),
	}
}

// rolesFor resolves a user's roles, failing open to no roles so a roles-store
// outage can never block login (least privilege: no roles ⇒ no admin powers).
func (h *Handler) rolesFor(email string) []string {
	roles, err := h.roles.Roles(email)
	if err != nil {
		log.Printf("roles lookup for %s: %v", email, err)
		return nil
	}
	return roles
}

func (h *Handler) Register(mux *http.ServeMux) {
	inner := http.NewServeMux()
	inner.HandleFunc("GET /healthz", h.healthz)
	inner.HandleFunc("GET /.well-known/jwks.json", h.jwks)
	inner.HandleFunc("GET /auth/resolve", h.resolve)
	inner.HandleFunc("GET /auth/login", h.login)
	inner.HandleFunc("GET /auth/callback", h.callback)
	inner.HandleFunc("POST /auth/refresh", h.refresh)
	// Code-sending carries the global rate limit on top of the per-IP one.
	inner.Handle("POST /auth/email/start", h.emailLimiter.Middleware(http.HandlerFunc(h.emailStart)))
	inner.HandleFunc("POST /auth/email/verify", h.emailVerify)
	inner.HandleFunc("GET /auth/me", h.me)
	inner.HandleFunc("POST /auth/logout", h.logout)
	inner.HandleFunc("POST /auth/sessions/logout-others", h.logoutOtherSessions)
	inner.HandleFunc("DELETE /auth/account", h.deleteAccount)
	inner.HandleFunc("POST /auth/link", h.linkAccount)
	inner.HandleFunc("DELETE /auth/link/{provider}", h.unlinkProvider)
	// Unauthenticated by design: this is the branch picker somebody registering
	// chooses from, which necessarily precedes having a session. It carries no
	// personal data — see publicBranches in org.go.
	inner.HandleFunc("GET /auth/org/branches", h.publicBranches)
	// Admission (see join.go). The context endpoint is authorized by the join
	// ticket rather than by a session, since its whole audience is people who
	// have proved an address and have no account.
	inner.HandleFunc("GET /auth/join/context", h.joinContext)
	// Recording a request sends mail, and a declined applicant may apply again,
	// so it carries a global cap on top of the per-IP one — an admin's inbox is
	// as much a quota as the relay is.
	inner.Handle("POST /auth/join/request", h.joinLimiter.Middleware(http.HandlerFunc(h.joinRequest)))
	inner.HandleFunc("POST /auth/join/withdraw", h.joinWithdraw)
	// Feedback submission carries its own global rate limit on top of the per-IP
	// one, same as email/start, since it triggers a real SMTP send.
	inner.Handle("POST /auth/feedback", h.feedbackLimiter.Middleware(http.HandlerFunc(h.submitFeedback)))
	// Admin user management (see admin.go) and the organization tree (org.go).
	// Authorization is enforced per handler — every one of these asks whether the
	// caller covers the scope it touches, not merely whether they are an admin.
	// The routes ride the same middleware chain below.
	inner.HandleFunc("GET /auth/admin/users", h.adminListUsers)
	inner.HandleFunc("PATCH /auth/admin/users/{id}", h.adminUpdateUser)
	inner.HandleFunc("PUT /auth/admin/users/{id}/roles", h.adminSetRoles)
	inner.HandleFunc("POST /auth/admin/users/{id}/logout", h.adminLogoutUser)
	inner.HandleFunc("GET /auth/admin/org", h.adminOrgTree)
	inner.HandleFunc("POST /auth/admin/federations", h.createFederation)
	inner.HandleFunc("PATCH /auth/admin/federations/{id}", h.renameFederation)
	inner.HandleFunc("POST /auth/admin/branches", h.createBranch)
	inner.HandleFunc("PATCH /auth/admin/branches/{id}", h.updateBranch)
	inner.HandleFunc("GET /auth/admin/requests", h.adminListRequests)
	inner.HandleFunc("POST /auth/admin/requests/{email}/approve", h.adminApproveRequest)
	inner.HandleFunc("POST /auth/admin/requests/{email}/deny", h.adminDenyRequest)
	mux.Handle("/", secureheaders.Middleware(cors.Middleware(h.frontendURL, csrf.Middleware(h.frontendURL, h.limiter.Middleware(inner)))))
}

func (h *Handler) healthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func (h *Handler) jwks(w http.ResponseWriter, r *http.Request) {
	data, err := h.tokens.JWKS()
	if err != nil {
		log.Printf("jwks: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// resolve reports whether an email domain has a configured OIDC provider, without
// initiating an OAuth flow. The frontend uses it as a preflight check on the login form.
// Query param: email=user@example.com
func (h *Handler) resolve(w http.ResponseWriter, r *http.Request) {
	email := strings.TrimSpace(r.URL.Query().Get("email"))
	if email == "" {
		http.Error(w, "email query parameter is required", http.StatusBadRequest)
		return
	}
	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 || parts[1] == "" {
		http.Error(w, "invalid email address", http.StatusBadRequest)
		return
	}
	domain := strings.ToLower(parts[1])

	providerName, ok := h.domains[domain]
	if !ok {
		http.Error(w, "no identity provider configured for this domain", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"provider": providerName})
}

// login resolves the user's email domain to an OIDC provider and initiates the flow.
// Query param: email=user@example.com
func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	email := strings.TrimSpace(r.URL.Query().Get("email"))
	if email == "" {
		http.Error(w, "email query parameter is required", http.StatusBadRequest)
		return
	}

	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 || parts[1] == "" {
		http.Error(w, "invalid email address", http.StatusBadRequest)
		return
	}
	domain := strings.ToLower(parts[1])

	providerName, ok := h.domains[domain]
	if !ok {
		http.Error(w, fmt.Sprintf("no identity provider configured for domain %q", domain), http.StatusBadRequest)
		return
	}
	p, ok := h.providers[providerName]
	if !ok {
		log.Printf("domain %q maps to unconfigured provider %q", domain, providerName)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	state, err := randomString(32)
	if err != nil {
		log.Printf("login: randomString: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	nonce, err := randomString(32)
	if err != nil {
		log.Printf("login: randomString: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	txnID, err := randomString(32)
	if err != nil {
		log.Printf("login: randomString: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// H1: set a short-lived HttpOnly cookie that the callback must echo back,
	// binding the OIDC round-trip to the browser that initiated it.
	http.SetCookie(w, &http.Cookie{
		Name:     txnCookieName,
		Value:    txnID,
		Path:     "/auth/callback",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode, // Lax (not Strict) so the cookie arrives on the provider redirect-back
		MaxAge:   int(stateTTL.Seconds()),
	})

	h.mu.Lock()
	h.pending[state] = pendingState{
		nonce:        nonce,
		providerName: providerName,
		expiresAt:    time.Now().Add(stateTTL),
		txnID:        txnID,
	}
	h.mu.Unlock()

	http.Redirect(w, r, p.AuthURL(state, nonce), http.StatusFound)
}

func (h *Handler) callback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	state := q.Get("state")
	code := q.Get("code")

	h.mu.Lock()
	ps, ok := h.pending[state]
	if ok {
		delete(h.pending, state)
	}
	h.mu.Unlock()

	if !ok || time.Now().After(ps.expiresAt) {
		http.Error(w, "invalid or expired state", http.StatusBadRequest)
		return
	}

	// H1: verify the transaction cookie matches the one set when the flow was initiated.
	// Always clear it, even on failure, so it doesn't linger in the browser.
	txnCookie, txnErr := r.Cookie(txnCookieName)
	http.SetCookie(w, &http.Cookie{
		Name:     txnCookieName,
		Value:    "",
		Path:     "/auth/callback",
		HttpOnly: true,
		Secure:   true,
		MaxAge:   -1,
	})
	if txnErr != nil || txnCookie.Value != ps.txnID {
		http.Error(w, "invalid or expired state", http.StatusBadRequest)
		return
	}

	p, ok := h.providers[ps.providerName]
	if !ok {
		http.Error(w, "unknown provider", http.StatusInternalServerError)
		return
	}

	info, err := p.Exchange(r.Context(), code, ps.nonce)
	if err != nil {
		log.Printf("OIDC exchange (%s): %v", ps.providerName, err)
		http.Error(w, "authentication failed", http.StatusUnauthorized)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)

	// Identity-link flow: add a new provider to an existing user's account.
	if ps.linkUserID != "" {
		// Reject if this identity is already linked to any account (including this one).
		existing, err := h.users.FindByLinkedIdentity(ps.providerName, info.Sub)
		if err != nil {
			log.Printf("link: identity lookup (%s, %s): %v", ps.providerName, info.Sub, err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		if existing != nil {
			http.Redirect(w, r, h.frontendURL+"?link_error=already_linked", http.StatusFound)
			return
		}

		target, err := h.users.FindByID(ps.linkUserID)
		if err != nil || target == nil {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		target.LinkedIdentities[ps.providerName] = store.LinkedIdentity{Sub: info.Sub, Email: info.Email}
		target.LastLoginAt = now
		if err := h.users.Save(target); err != nil {
			log.Printf("link save %s: %v", target.ID, err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		log.Printf("linked %s identity %s to user %s", ps.providerName, info.Sub, target.ID)
		http.Redirect(w, r, h.frontendURL+"?link_success=1", http.StatusFound)
		return
	}

	// Normal login flow.
	user, err := h.users.FindByLinkedIdentity(ps.providerName, info.Sub)
	if err != nil {
		log.Printf("user lookup (%s, %s): %v", ps.providerName, info.Sub, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if user == nil {
		// Controlling an address is not grounds for an account. Hand back a join
		// ticket instead of enrolling, and let the branch decide.
		if err := h.setJoinTicket(w, token.JoinTicket{
			Provider: ps.providerName,
			Sub:      info.Sub,
			Email:    info.Email,
			Name:     info.DisplayName,
		}); err != nil {
			log.Printf("callback: issue join ticket for %s: %v", info.Email, err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		logJoinTicketIssued(ps.providerName, info.Email)
		http.Redirect(w, r, h.frontendURL+"?join=1", http.StatusFound)
		return
	}

	// Keep provider email in sync in case it changed at the provider.
	user.LinkedIdentities[ps.providerName] = store.LinkedIdentity{
		Sub:   info.Sub,
		Email: info.Email,
	}
	user.LastLoginAt = now

	if err := h.users.Save(user); err != nil {
		log.Printf("user save %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	if err := h.issueSession(w, user); err != nil {
		log.Printf("callback: issue session %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, h.frontendURL+"?auth_success=1", http.StatusFound)
}

// issueSession mints an access token in a fresh refresh-token family and sets
// both auth cookies. Shared by the OIDC callback and the email verify flow.
func (h *Handler) issueSession(w http.ResponseWriter, user *store.User) error {
	familyID, err := store.NewFamilyID()
	if err != nil {
		return fmt.Errorf("family ID generate: %w", err)
	}
	accessToken, err := h.tokens.Issue(h.identityFor(user, familyID))
	if err != nil {
		return fmt.Errorf("token issue: %w", err)
	}
	rt, err := store.NewRefreshToken(user.ID, familyID)
	if err != nil {
		return fmt.Errorf("refresh token generate: %w", err)
	}
	if err := h.refreshTokens.Create(rt); err != nil {
		return fmt.Errorf("refresh token create: %w", err)
	}
	h.setTokenCookies(w, accessToken, rt.ID)
	return nil
}

// emailStart begins email (code) login for a non-OIDC domain. It returns one of
// three actions so the frontend knows what to do next:
//   - "oidc": the domain actually has an OIDC provider — redirect there instead.
//   - "existing": a code was emailed; the account exists (no name needed).
//   - "new": a code was emailed; the account is new (collect a name on verify).
//
// It is wrapped by the global rate limiter, so at most one code is sent every 5s.
func (h *Handler) emailStart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Language string `json:"language"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	addr := strings.ToLower(strings.TrimSpace(req.Email))
	parts := strings.SplitN(addr, "@", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		http.Error(w, "invalid email address", http.StatusBadRequest)
		return
	}
	domain := parts[1]

	// OIDC domains never use codes — tell the frontend to redirect.
	if providerName, ok := h.domains[domain]; ok {
		writeJSON(w, map[string]string{"action": "oidc", "provider": providerName})
		return
	}

	user, err := h.users.FindByLinkedIdentity(emailProviderName, addr)
	if err != nil {
		log.Printf("emailStart: user lookup %s: %v", addr, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	isNew := user == nil

	code, err := newNumericCode()
	if err != nil {
		log.Printf("emailStart: code generation: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// One active code per address: a resend overwrites the previous one.
	h.mu.Lock()
	h.emailCodes[addr] = emailCode{
		codeHash:  sha256.Sum256([]byte(code)),
		expiresAt: time.Now().Add(emailCodeTTL),
	}
	h.mu.Unlock()

	if err := h.mailer.SendVerificationCode(r.Context(), addr, code, normalizeLang(req.Language), emailCodeTTL); err != nil {
		log.Printf("emailStart: send code to %s: %v", addr, err)
		http.Error(w, "could not send verification email", http.StatusBadGateway)
		return
	}

	action := "existing"
	if isNew {
		action = "new"
	}
	// The sign-in screen tells the user how long the code lasts, so it needs the
	// TTL from here rather than a copy of the number that would drift from it.
	writeJSON(w, map[string]any{
		"action":             action,
		"expires_in_seconds": int(emailCodeTTL.Seconds()),
	})
}

// emailVerify checks a verification code and, on success, signs the user in —
// creating the account (with the submitted name) if it doesn't exist yet.
func (h *Handler) emailVerify(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
		Code  string `json:"code"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	addr := strings.ToLower(strings.TrimSpace(req.Email))
	code := strings.TrimSpace(req.Code)
	if addr == "" || code == "" {
		writeJSONStatus(w, http.StatusBadRequest, map[string]string{"error": "invalid_code"})
		return
	}

	h.mu.Lock()
	ec, ok := h.emailCodes[addr]
	switch {
	case !ok || time.Now().After(ec.expiresAt):
		delete(h.emailCodes, addr) // clear an expired entry if present
		h.mu.Unlock()
		writeJSONStatus(w, http.StatusBadRequest, map[string]string{"error": "invalid_code"})
		return
	case ec.attempts >= emailCodeMaxTries:
		delete(h.emailCodes, addr)
		h.mu.Unlock()
		writeJSONStatus(w, http.StatusBadRequest, map[string]string{"error": "too_many_attempts"})
		return
	}
	got := sha256.Sum256([]byte(code))
	if subtle.ConstantTimeCompare(ec.codeHash[:], got[:]) != 1 {
		ec.attempts++
		h.emailCodes[addr] = ec
		h.mu.Unlock()
		writeJSONStatus(w, http.StatusBadRequest, map[string]string{"error": "invalid_code"})
		return
	}
	delete(h.emailCodes, addr) // success: consume the code
	h.mu.Unlock()

	now := time.Now().UTC().Format(time.RFC3339)

	// Re-derive existence at verify time (the account may have appeared since the
	// code was sent); the name is only stored when we actually create the user.
	user, err := h.users.FindByLinkedIdentity(emailProviderName, addr)
	if err != nil {
		log.Printf("emailVerify: user lookup %s: %v", addr, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if user == nil {
		// A valid code proves the address and nothing more. The name is carried
		// on the ticket rather than stored, since there is no user to store it on
		// until a branch admits one.
		if err := h.setJoinTicket(w, token.JoinTicket{
			Provider: emailProviderName,
			Sub:      addr,
			Email:    addr,
			Name:     strings.TrimSpace(req.Name),
		}); err != nil {
			log.Printf("emailVerify: issue join ticket for %s: %v", addr, err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		logJoinTicketIssued(emailProviderName, addr)
		writeJSON(w, map[string]string{"action": "join_required"})
		return
	}
	user.LastLoginAt = now

	if err := h.users.Save(user); err != nil {
		log.Printf("emailVerify: user save %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	if err := h.issueSession(w, user); err != nil {
		log.Printf("emailVerify: issue session %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	claims, err := h.claimsFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := h.users.FindByID(claims.Subject)
	if err != nil || user == nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	roles := h.rolesFor(user.Email)
	if roles == nil {
		roles = []string{} // marshal as [] rather than null for the frontend
	}
	// Embed the user so its fields stay flat, then add the roles the frontend
	// uses to gate admin-only UI.
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		*store.User
		Roles []string `json:"roles"`
		// Resolved rather than stored: the branch knows its federation, and the
		// frontend should not have to fetch the tree to find out.
		Federation string `json:"federation,omitempty"`
	}{User: user, Roles: roles, Federation: h.orgs.FederationOf(user.BranchID)})
}

func (h *Handler) refresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(refreshCookieName)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// FindAndDelete atomically reads and deletes the token (ETag-guarded in Cosmos)
	// so two concurrent refresh requests cannot both rotate the same token.
	rt, err := h.refreshTokens.FindAndDelete(cookie.Value)
	if err != nil {
		if errors.Is(err, store.ErrConcurrentModification) {
			// A concurrent request won the rotation race; return 401 so the client
			// retries with the new cookie set by the winning request.
			h.clearTokenCookies(w)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		log.Printf("refresh token find-and-delete: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if rt == nil {
		// Token not found — check for token replay (OAuth 2.1 BCP §4.13.2).
		// If the presented token belongs to a family that still has an active member,
		// the token was stolen and replayed after rotation → revoke all user tokens.
		userID, hasUser := store.UserIDFromTokenID(cookie.Value)
		familyID, hasFamily := store.FamilyIDFromTokenID(cookie.Value)
		if hasUser && hasFamily {
			active, ferr := h.refreshTokens.FindByFamilyID(userID, familyID)
			if ferr != nil {
				log.Printf("refresh: family lookup %s/%s: %v", userID, familyID, ferr)
			} else if active != nil {
				log.Printf("refresh: token replay detected for user %s family %s — revoking all tokens", userID, familyID)
				if err := h.refreshTokens.DeleteByUserID(userID); err != nil {
					log.Printf("refresh: revoke all tokens for %s: %v", userID, err)
				}
			}
		}
		h.clearTokenCookies(w)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Token was atomically deleted by FindAndDelete; issue a new one in the same family.
	user, err := h.users.FindByID(rt.UserID)
	if err != nil || user == nil {
		h.clearTokenCookies(w)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	newRT, err := store.NewRefreshToken(user.ID, rt.FamilyID)
	if err != nil {
		log.Printf("refresh token generate for %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if err := h.refreshTokens.Create(newRT); err != nil {
		log.Printf("refresh token create for %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	accessToken, err := h.tokens.Issue(h.identityFor(user, rt.FamilyID))
	if err != nil {
		log.Printf("token issue for %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	h.setTokenCookies(w, accessToken, newRT.ID)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	// The refresh cookie is path-scoped to /auth/refresh and won't arrive here.
	// Derive the user ID from the access token (path "/") and revoke all their tokens.
	if claims, err := h.claimsFromRequest(r); err == nil {
		if err := h.refreshTokens.DeleteByUserID(claims.Subject); err != nil {
			log.Printf("logout: delete refresh tokens for %s: %v", claims.Subject, err)
		}
	}
	h.clearTokenCookies(w)
	w.WriteHeader(http.StatusNoContent)
}

// logoutOtherSessions revokes every refresh token for the authenticated user
// except the one belonging to the current session (identified by the "fam"
// claim). Other devices keep their access token until it expires
// (≤ AccessTokenTTL), after which they can no longer refresh. The current
// session is left untouched.
func (h *Handler) logoutOtherSessions(w http.ResponseWriter, r *http.Request) {
	claims, err := h.claimsFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if claims.Family == "" {
		// Access token predates the family claim, so we can't tell which session
		// is "current". Refuse rather than risk logging the caller out too; the
		// token rotates to one carrying the claim within AccessTokenTTL.
		http.Error(w, "session not identifiable yet; try again shortly", http.StatusConflict)
		return
	}
	if err := h.refreshTokens.DeleteByUserIDExceptFamily(claims.Subject, claims.Family); err != nil {
		log.Printf("logoutOtherSessions revoke %s: %v", claims.Subject, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) deleteAccount(w http.ResponseWriter, r *http.Request) {
	claims, err := h.claimsFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if err := h.refreshTokens.DeleteByUserID(claims.Subject); err != nil {
		log.Printf("deleteAccount refresh tokens %s: %v", claims.Subject, err)
	}
	if err := h.users.Delete(claims.Subject); err != nil {
		log.Printf("deleteAccount %s: %v", claims.Subject, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	h.clearTokenCookies(w)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) setTokenCookies(w http.ResponseWriter, accessToken, refreshToken string) {
	http.SetCookie(w, &http.Cookie{
		Name:     accessCookieName,
		Value:    accessToken,
		Path:     "/",
		Domain:   h.cookieDomain,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(token.AccessTokenTTL.Seconds()),
	})
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    refreshToken,
		Path:     "/auth/refresh",
		Domain:   h.cookieDomain,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(store.RefreshTokenTTL.Seconds()),
	})
}

func (h *Handler) clearTokenCookies(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     accessCookieName,
		Value:    "",
		Path:     "/",
		Domain:   h.cookieDomain,
		HttpOnly: true,
		Secure:   true,
		MaxAge:   -1,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     "/auth/refresh",
		Domain:   h.cookieDomain,
		HttpOnly: true,
		Secure:   true,
		MaxAge:   -1,
	})
}

// linkAccount initiates an OIDC flow to add another provider identity to the
// currently authenticated user's account.
func (h *Handler) linkAccount(w http.ResponseWriter, r *http.Request) {
	claims, err := h.claimsFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	email := strings.TrimSpace(r.URL.Query().Get("email"))
	if email == "" {
		http.Error(w, "email query parameter is required", http.StatusBadRequest)
		return
	}
	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 || parts[1] == "" {
		http.Error(w, "invalid email address", http.StatusBadRequest)
		return
	}
	domain := strings.ToLower(parts[1])

	providerName, ok := h.domains[domain]
	if !ok {
		http.Error(w, fmt.Sprintf("no identity provider configured for domain %q", domain), http.StatusBadRequest)
		return
	}
	p, ok := h.providers[providerName]
	if !ok {
		log.Printf("domain %q maps to unconfigured provider %q", domain, providerName)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	state, err := randomString(32)
	if err != nil {
		log.Printf("linkAccount: randomString: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	nonce, err := randomString(32)
	if err != nil {
		log.Printf("linkAccount: randomString: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	txnID, err := randomString(32)
	if err != nil {
		log.Printf("linkAccount: randomString: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     txnCookieName,
		Value:    txnID,
		Path:     "/auth/callback",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(stateTTL.Seconds()),
	})

	h.mu.Lock()
	h.pending[state] = pendingState{
		nonce:        nonce,
		providerName: providerName,
		expiresAt:    time.Now().Add(stateTTL),
		linkUserID:   claims.Subject,
		txnID:        txnID,
	}
	h.mu.Unlock()

	http.Redirect(w, r, p.AuthURL(state, nonce), http.StatusFound)
}

// unlinkProvider removes a provider identity from the authenticated user's account.
// Returns 409 if it is the user's only linked provider.
func (h *Handler) unlinkProvider(w http.ResponseWriter, r *http.Request) {
	claims, err := h.claimsFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	providerName := r.PathValue("provider")

	user, err := h.users.FindByID(claims.Subject)
	if err != nil || user == nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	if _, ok := user.LinkedIdentities[providerName]; !ok {
		http.Error(w, "provider not linked to this account", http.StatusBadRequest)
		return
	}
	if len(user.LinkedIdentities) <= 1 {
		http.Error(w, "cannot unlink the only remaining identity provider", http.StatusConflict)
		return
	}

	delete(user.LinkedIdentities, providerName)
	if err := h.users.Save(user); err != nil {
		log.Printf("unlinkProvider %s/%s: %v", user.ID, providerName, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("unlinked %s identity from user %s", providerName, user.ID)
	w.WriteHeader(http.StatusNoContent)
}

// feedbackMaxLen bounds the feedback message so a submission can't blow up the
// outgoing email (or someone's inbox).
const feedbackMaxLen = 4000

// feedbackMetaMaxLen bounds the client-supplied context fields (app version).
// They're attacker-controlled request-body values, so even though they only
// ever land in an email body (never a header), they get a sane cap too.
const feedbackMetaMaxLen = 200

// submitFeedback relays an in-app feedback submission by email to the
// configured recipients. Requires a valid session so the message can be
// attributed (and replied to) — feedback is not accepted anonymously.
func (h *Handler) submitFeedback(w http.ResponseWriter, r *http.Request) {
	claims, err := h.claimsFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if len(h.feedbackRecipients) == 0 {
		log.Printf("submitFeedback: no recipients configured; dropping submission from %s", claims.Subject)
		http.Error(w, "feedback is not accepted right now", http.StatusServiceUnavailable)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var req struct {
		Message    string `json:"message"`
		Language   string `json:"language"`
		AppVersion string `json:"appVersion"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	message := strings.TrimSpace(req.Message)
	if message == "" {
		http.Error(w, "message is required", http.StatusBadRequest)
		return
	}
	if len(message) > feedbackMaxLen {
		http.Error(w, fmt.Sprintf("message must be %d characters or fewer", feedbackMaxLen), http.StatusBadRequest)
		return
	}

	user, err := h.users.FindByID(claims.Subject)
	if err != nil || user == nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	submitterName := user.DisplayName
	if submitterName == "" {
		submitterName = user.Email
	}

	submission := email.FeedbackSubmission{
		SubmitterName:  submitterName,
		SubmitterEmail: user.Email,
		AppVersion:     truncatedOrUnknown(req.AppVersion, feedbackMetaMaxLen),
		Language:       normalizeLang(req.Language),
		// The User-Agent header comes from the request itself, not the client-
		// supplied body, so it can't be spoofed independently of the connection
		// that's actually making the call.
		UserAgent: truncatedOrUnknown(r.UserAgent(), feedbackMetaMaxLen),
		Message:   message,
	}

	if err := h.mailer.SendFeedback(r.Context(), h.feedbackRecipients, submission); err != nil {
		log.Printf("submitFeedback: send from %s: %v", user.Email, err)
		http.Error(w, "could not send feedback", http.StatusBadGateway)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) claimsFromRequest(r *http.Request) (*token.Claims, error) {
	cookie, err := r.Cookie(accessCookieName)
	if err != nil {
		return nil, err
	}
	return h.tokens.Verify(cookie.Value)
}

// sweepExpiredStates periodically removes stale pending OIDC states and
// verification codes.
func (h *Handler) sweepExpiredStates() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		h.mu.Lock()
		for k, v := range h.pending {
			if now.After(v.expiresAt) {
				delete(h.pending, k)
			}
		}
		for k, v := range h.emailCodes {
			if now.After(v.expiresAt) {
				delete(h.emailCodes, k)
			}
		}
		h.mu.Unlock()
	}
}

// writeJSON encodes v as a 200 JSON response.
func writeJSON(w http.ResponseWriter, v any) {
	writeJSONStatus(w, http.StatusOK, v)
}

// writeJSONStatus encodes v as a JSON response with the given status code.
func writeJSONStatus(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// newNumericCode returns a uniformly random 6-digit verification code (zero-padded).
func newNumericCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", fmt.Errorf("rand.Int: %w", err)
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// truncatedOrUnknown trims s, caps it at maxLen runes, and falls back to
// "unknown" when empty — used for client-supplied context fields on feedback
// submissions that are nice-to-have but never required.
func truncatedOrUnknown(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "unknown"
	}
	runes := []rune(s)
	if len(runes) > maxLen {
		return string(runes[:maxLen])
	}
	return s
}

// normalizeLang maps an arbitrary language hint to a supported email-template
// language, defaulting to English.
func normalizeLang(lang string) string {
	switch strings.ToLower(strings.TrimSpace(lang)) {
	case "sv", "tr", "ja":
		return strings.ToLower(strings.TrimSpace(lang))
	default:
		return "en"
	}
}

func randomString(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("rand.Read: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// newUUID generates a random UUID v4.
