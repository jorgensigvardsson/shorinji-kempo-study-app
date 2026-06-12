package api

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

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
)

type pendingState struct {
	nonce        string
	providerName string
	expiresAt    time.Time
	linkUserID   string // non-empty → identity-link flow; this user gets the new identity added
	txnID        string // H1: random value mirrored as a browser cookie to bind the flow to the initiating browser
}

type Handler struct {
	providers     map[string]provider.Provider // provider name → provider
	domains       map[string]string            // email domain → provider name
	users         store.UserStore
	refreshTokens store.RefreshTokenStore
	roles         store.RoleStore
	tokens        *token.Manager
	frontendURL   string
	cookieDomain  string
	limiter       *ratelimit.IPRateLimiter
	mu            sync.Mutex
	pending       map[string]pendingState
}

func NewHandler(
	providers map[string]provider.Provider,
	domains map[string]string,
	users store.UserStore,
	refreshTokens store.RefreshTokenStore,
	roles store.RoleStore,
	tokens *token.Manager,
	frontendURL string,
	cookieDomain string,
	limiter *ratelimit.IPRateLimiter,
) *Handler {
	h := &Handler{
		providers:     providers,
		domains:       domains,
		users:         users,
		refreshTokens: refreshTokens,
		roles:         roles,
		tokens:        tokens,
		frontendURL:   frontendURL,
		cookieDomain:  cookieDomain,
		limiter:       limiter,
		pending:       make(map[string]pendingState),
	}
	go h.sweepExpiredStates()
	return h
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
	inner.HandleFunc("GET /auth/me", h.me)
	inner.HandleFunc("POST /auth/logout", h.logout)
	inner.HandleFunc("DELETE /auth/account", h.deleteAccount)
	inner.HandleFunc("POST /auth/link", h.linkAccount)
	inner.HandleFunc("DELETE /auth/link/{provider}", h.unlinkProvider)
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
		uuid, err := newUUID()
		if err != nil {
			log.Printf("uuid generation: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		log.Printf("enrolling new user %s via %s (%s)", uuid, ps.providerName, info.Email)
		user = &store.User{
			ID:          uuid,
			Email:       info.Email,
			DisplayName: info.DisplayName,
			LinkedIdentities: map[string]store.LinkedIdentity{
				ps.providerName: {Sub: info.Sub, Email: info.Email},
			},
			CreatedAt: now,
		}
	} else {
		// Keep provider email in sync in case it changed at the provider.
		user.LinkedIdentities[ps.providerName] = store.LinkedIdentity{
			Sub:   info.Sub,
			Email: info.Email,
		}
	}
	user.LastLoginAt = now

	if err := h.users.Save(user); err != nil {
		log.Printf("user save %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	accessToken, err := h.tokens.Issue(user.ID, user.Email, user.DisplayName, h.rolesFor(user.Email))
	if err != nil {
		log.Printf("token issue for %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	familyID, err := store.NewFamilyID()
	if err != nil {
		log.Printf("family ID generate for %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	rt, err := store.NewRefreshToken(user.ID, familyID)
	if err != nil {
		log.Printf("refresh token generate for %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if err := h.refreshTokens.Create(rt); err != nil {
		log.Printf("refresh token create for %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	h.setTokenCookies(w, accessToken, rt.ID)
	http.Redirect(w, r, h.frontendURL+"?auth_success=1", http.StatusFound)
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
	}{User: user, Roles: roles})
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

	accessToken, err := h.tokens.Issue(user.ID, user.Email, user.DisplayName, h.rolesFor(user.Email))
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

func (h *Handler) claimsFromRequest(r *http.Request) (*token.Claims, error) {
	cookie, err := r.Cookie(accessCookieName)
	if err != nil {
		return nil, err
	}
	return h.tokens.Verify(cookie.Value)
}

// sweepExpiredStates periodically removes stale pending OIDC states.
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
		h.mu.Unlock()
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
func newUUID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant RFC 4122
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}
