package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/token"
)

const adminRole = "admin"

// requireAdmin authorizes a request as an admin. It returns the caller's claims
// on success; otherwise it writes the appropriate error response (401 when the
// token is missing/invalid, 403 when authenticated but lacking the admin role)
// and returns a nil claims so the caller can return immediately.
func (h *Handler) requireAdmin(w http.ResponseWriter, r *http.Request) *token.Claims {
	claims, err := h.claimsFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return nil
	}
	if !containsRole(claims.Roles, adminRole) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return nil
	}
	return claims
}

// adminUser is the per-user shape returned by the admin listing. It embeds the
// stored user (flat fields) and adds the live roles plus an oidc flag the UI uses
// to decide whether the display name is editable.
type adminUser struct {
	*store.User
	Roles []string `json:"roles"`
	OIDC  bool     `json:"oidc"` // true when any linked identity is an OIDC provider (not "email")
}

// adminListUsers returns every user with their resolved roles. Admin only.
func (h *Handler) adminListUsers(w http.ResponseWriter, r *http.Request) {
	if h.requireAdmin(w, r) == nil {
		return
	}
	users, err := h.users.List()
	if err != nil {
		log.Printf("adminListUsers: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	out := make([]adminUser, 0, len(users))
	for _, u := range users {
		roles := h.rolesFor(u.Email)
		if roles == nil {
			roles = []string{} // marshal as [] rather than null
		}
		out = append(out, adminUser{User: u, Roles: roles, OIDC: hasOIDCIdentity(u)})
	}
	writeJSON(w, out)
}

// adminUpdateUser edits an editable user field. Currently only the display name,
// and only for users with no OIDC identity (OIDC display names come from the
// provider). Admin only.
func (h *Handler) adminUpdateUser(w http.ResponseWriter, r *http.Request) {
	if h.requireAdmin(w, r) == nil {
		return
	}
	id := r.PathValue("id")

	var req struct {
		DisplayName string `json:"displayName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	user, err := h.users.FindByID(id)
	if err != nil {
		log.Printf("adminUpdateUser lookup %s: %v", id, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if user == nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	if hasOIDCIdentity(user) {
		http.Error(w, "display name is managed by the identity provider for OIDC users", http.StatusConflict)
		return
	}

	user.DisplayName = strings.TrimSpace(req.DisplayName)
	if err := h.users.Save(user); err != nil {
		log.Printf("adminUpdateUser save %s: %v", id, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("admin updated display name for user %s", id)
	w.WriteHeader(http.StatusNoContent)
}

// adminSetRoles promotes or demotes a user's admin role. The body carries the
// desired admin state; other roles (if any) are preserved. An admin cannot
// remove their own admin role (lockout guard). Admin only.
func (h *Handler) adminSetRoles(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAdmin(w, r)
	if claims == nil {
		return
	}
	id := r.PathValue("id")

	var req struct {
		Admin bool `json:"admin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	user, err := h.users.FindByID(id)
	if err != nil {
		log.Printf("adminSetRoles lookup %s: %v", id, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if user == nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	if !req.Admin && user.ID == claims.Subject {
		http.Error(w, "cannot remove your own admin role", http.StatusConflict)
		return
	}

	current := h.rolesFor(user.Email)
	next := setRole(current, adminRole, req.Admin)
	if err := h.roles.SetRoles(user.Email, next); err != nil {
		log.Printf("adminSetRoles save %s: %v", id, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("admin set admin=%t for user %s (%s)", req.Admin, id, user.Email)
	w.WriteHeader(http.StatusNoContent)
}

// adminLogoutUser forcibly ends every session for the target user by revoking all
// of their refresh tokens. The user's current access token keeps working until it
// expires (≤ AccessTokenTTL); after that they can no longer refresh and are fully
// logged out. Admin only.
func (h *Handler) adminLogoutUser(w http.ResponseWriter, r *http.Request) {
	if h.requireAdmin(w, r) == nil {
		return
	}
	id := r.PathValue("id")

	user, err := h.users.FindByID(id)
	if err != nil {
		log.Printf("adminLogoutUser lookup %s: %v", id, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if user == nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	if err := h.refreshTokens.DeleteByUserID(id); err != nil {
		log.Printf("adminLogoutUser revoke %s: %v", id, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("admin force-logged-out user %s (%s)", id, user.Email)
	w.WriteHeader(http.StatusNoContent)
}

// hasOIDCIdentity reports whether the user has any linked identity other than the
// email (code) provider.
func hasOIDCIdentity(u *store.User) bool {
	for provider := range u.LinkedIdentities {
		if provider != emailProviderName {
			return true
		}
	}
	return false
}

func containsRole(roles []string, role string) bool {
	for _, r := range roles {
		if r == role {
			return true
		}
	}
	return false
}

// setRole returns roles with role added (want=true) or removed (want=false),
// preserving the other roles and their order.
func setRole(roles []string, role string, want bool) []string {
	out := make([]string, 0, len(roles)+1)
	present := false
	for _, r := range roles {
		if r == role {
			present = true
			if !want {
				continue
			}
		}
		out = append(out, r)
	}
	if want && !present {
		out = append(out, role)
	}
	return out
}
