package api

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/provider"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/token"
)

const (
	accessCookieName = "access_token"
	stateTTL         = 10 * time.Minute
)

type pendingState struct {
	nonce        string
	providerName string
	expiresAt    time.Time
}

type Handler struct {
	providers   map[string]provider.Provider // provider name → provider
	domains     map[string]string            // email domain → provider name
	users       store.UserStore
	tokens      *token.Manager
	frontendURL string
	mu          sync.Mutex
	pending     map[string]pendingState
}

func NewHandler(
	providers map[string]provider.Provider,
	domains map[string]string,
	users store.UserStore,
	tokens *token.Manager,
	frontendURL string,
) *Handler {
	h := &Handler{
		providers:   providers,
		domains:     domains,
		users:       users,
		tokens:      tokens,
		frontendURL: frontendURL,
		pending:     make(map[string]pendingState),
	}
	go h.sweepExpiredStates()
	return h
}

func (h *Handler) Register(mux *http.ServeMux) {
	inner := http.NewServeMux()
	inner.HandleFunc("GET /healthz", h.healthz)
	inner.HandleFunc("GET /.well-known/jwks.json", h.jwks)
	inner.HandleFunc("GET /auth/login", h.login)
	inner.HandleFunc("GET /auth/resolve", h.resolve)
	inner.HandleFunc("GET /auth/callback", h.callback)
	inner.HandleFunc("GET /auth/me", h.me)
	inner.HandleFunc("POST /auth/logout", h.logout)
	mux.Handle("/", corsMiddleware(h.frontendURL, inner))
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

// resolve checks whether a domain is supported without initiating the OIDC flow.
// Used by the frontend for client-side preflight before redirecting.
// Query param: email=user@example.com
// Response: 200 {"provider":"google"} or 400 {"error":"..."}
func (h *Handler) resolve(w http.ResponseWriter, r *http.Request) {
	email := strings.TrimSpace(r.URL.Query().Get("email"))
	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 || parts[1] == "" {
		w.Header().Set("Content-Type", "application/json")
		http.Error(w, `{"error":"invalid email address"}`, http.StatusBadRequest)
		return
	}
	domain := strings.ToLower(parts[1])
	providerName, ok := h.domains[domain]
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintf(w, `{"error":"no identity provider configured for domain %q"}`, domain)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"provider":%q}`, providerName)
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

	state := randomString(32)
	nonce := randomString(32)

	h.mu.Lock()
	h.pending[state] = pendingState{
		nonce:        nonce,
		providerName: providerName,
		expiresAt:    time.Now().Add(stateTTL),
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

	accessToken, err := h.tokens.Issue(user.ID, user.Email)
	if err != nil {
		log.Printf("token issue for %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     accessCookieName,
		Value:    accessToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(token.AccessTokenTTL.Seconds()),
	})

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
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     accessCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
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

func randomString(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
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
