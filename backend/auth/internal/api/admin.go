package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/token"
)

// requireAnyAdmin authorizes a request as some kind of admin: authenticated, and
// holding at least one role this system recognises. It deliberately does not say
// which — the endpoints below decide that per target, because "may you act on
// this user?" depends on the branch that user is in, which is not known until
// the user has been read.
//
// It returns the caller's claims on success; otherwise it writes the response
// (401 when the token is missing or invalid, 403 when authenticated but holding
// no admin role at all) and returns nil so the caller can return immediately.
func (h *Handler) requireAnyAdmin(w http.ResponseWriter, r *http.Request) *token.Claims {
	claims, err := h.claimsFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return nil
	}
	for _, role := range claims.Roles {
		if _, ok := authz.ScopeOf(role); ok {
			return claims
		}
	}
	http.Error(w, "forbidden", http.StatusForbidden)
	return nil
}

// covers reports whether the caller holds authority over a scope. The nil check
// is not superstition: a nil *org.Tree would satisfy the resolver interface as a
// non-nil value and panic on first use, so it is turned back into an honest nil,
// which authz reads as "no branch membership can be proven".
func (h *Handler) covers(claims *token.Claims, scope authz.Scope) bool {
	if h.orgs == nil {
		return authz.Covers(claims.Roles, scope, nil)
	}
	return authz.Covers(claims.Roles, scope, h.orgs)
}

// canSee reports whether the caller may act on a particular user at all, which
// is authority over the branch that user belongs to. A user with no branch
// belongs to nobody, and so is visible to a global or WSKO admin alone.
func (h *Handler) canSee(claims *token.Claims, user *store.User) bool {
	return h.covers(claims, authz.Branch(user.BranchID))
}

// adminUser is the per-user shape returned by the admin listing. It embeds the
// stored user (flat fields) and adds the live roles plus an oidc flag the UI uses
// to decide whether the display name is editable.
type adminUser struct {
	*store.User
	Roles []string `json:"roles"`
	OIDC  bool     `json:"oidc"` // true when any linked identity is an OIDC provider (not "email")
}

// adminListUsers returns the users the caller is allowed to see, with their
// resolved roles.
func (h *Handler) adminListUsers(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}
	users, err := h.visibleUsers(claims)
	if err != nil {
		log.Printf("adminListUsers: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	out := make([]adminUser, 0, len(users))
	for _, u := range users {
		out = append(out, h.asAdminUser(u))
	}
	writeJSON(w, out)
}

// visibleUsers resolves the caller's roles into a set of users. A global or WSKO
// admin gets the full scan the listing has always done; anybody else gets the
// members of the branches they administer, which for a federation admin means
// every branch the tree files under their federation.
func (h *Handler) visibleUsers(claims *token.Claims) ([]*store.User, error) {
	if h.covers(claims, authz.WSKO()) {
		return h.users.List()
	}

	seen := map[string]bool{}
	var branchIDs []string
	add := func(id string) {
		if id != "" && !seen[id] {
			seen[id] = true
			branchIDs = append(branchIDs, id)
		}
	}
	for _, role := range claims.Roles {
		scope, ok := authz.ScopeOf(role)
		if !ok {
			continue
		}
		switch scope.Kind {
		case authz.KindBranch:
			add(scope.ID)
		case authz.KindFederation:
			if h.orgs != nil {
				for _, id := range h.orgs.BranchesIn(scope.ID) {
					add(id)
				}
			}
		}
	}
	// No usable branches means nothing to show. ListByBranches is careful enough
	// to say so rather than falling back to everything.
	return h.users.ListByBranches(branchIDs)
}

// adminFindVisibleUser reads the target of an admin action and confirms the
// caller may act on it. A user the caller cannot see is reported as 404 rather
// than 403: the listing already hides them, and a 403 would confirm that an
// account exists in a branch the caller has no business knowing about.
func (h *Handler) adminFindVisibleUser(w http.ResponseWriter, claims *token.Claims, id, what string) *store.User {
	user, err := h.users.FindByID(id)
	if err != nil {
		log.Printf("%s lookup %s: %v", what, id, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil
	}
	if user == nil || !h.canSee(claims, user) {
		http.Error(w, "user not found", http.StatusNotFound)
		return nil
	}
	return user
}

// adminUpdateUser edits an editable user field. Currently only the display name,
// and only for users with no OIDC identity (OIDC display names come from the
// provider).
func (h *Handler) adminUpdateUser(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}

	var req struct {
		DisplayName string `json:"displayName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	user := h.adminFindVisibleUser(w, claims, r.PathValue("id"), "adminUpdateUser")
	if user == nil {
		return
	}
	if hasOIDCIdentity(user) {
		http.Error(w, "display name is managed by the identity provider for OIDC users", http.StatusConflict)
		return
	}

	user.DisplayName = strings.TrimSpace(req.DisplayName)
	if err := h.users.Save(user); err != nil {
		log.Printf("adminUpdateUser save %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("admin updated display name for user %s", user.ID)
	w.WriteHeader(http.StatusNoContent)
}

// adminSetRoles replaces a user's roles with the requested set.
//
// The caller must cover the scope of every role that actually changes, which is
// the whole of the delegation rule and the reason it needs no rules of its own:
// a federation admin may appoint branch admins inside their federation because
// they cover those branches, and cannot mint a global admin because nothing
// covers WSKO but WSKO. Roles that do not change are not re-checked, so an
// assignment somebody further up made is preserved rather than quietly dropped
// by an admin who could not have made it themselves.
func (h *Handler) adminSetRoles(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}

	var req struct {
		Roles []string `json:"roles"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	user := h.adminFindVisibleUser(w, claims, r.PathValue("id"), "adminSetRoles")
	if user == nil {
		return
	}

	current := h.rolesFor(user.Email)
	next := dedupeRoles(req.Roles)

	for _, role := range changedRoles(current, next) {
		scope, ok := authz.ScopeOf(role)
		if !ok {
			http.Error(w, "unknown role", http.StatusBadRequest)
			return
		}
		if !h.covers(claims, scope) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		// Covering WSKO is not enough to hand out the technical superuser. Both
		// roles scope to the root, so the rule above would let a wsko_admin grant
		// themselves the one power their own role deliberately withholds. Only an
		// admin makes an admin — or unmakes one.
		if role == authz.RoleAdmin && !containsRole(claims.Roles, authz.RoleAdmin) {
			http.Error(w, "only an admin may grant or revoke the admin role", http.StatusForbidden)
			return
		}
	}

	// Lockout guard: an admin may not strip their own authority over everything.
	// Scoped roles are deliberately not guarded — somebody above can restore one,
	// whereas the last global admin demoting themselves is unrecoverable.
	if user.ID == claims.Subject {
		for _, role := range []string{authz.RoleAdmin, authz.RoleWSKOAdmin} {
			if containsRole(current, role) && !containsRole(next, role) {
				http.Error(w, "cannot remove your own "+role+" role", http.StatusConflict)
				return
			}
		}
	}

	if err := h.roles.SetRoles(user.Email, next); err != nil {
		log.Printf("adminSetRoles save %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("admin %s set roles %v for user %s (%s)", claims.Subject, next, user.ID, user.Email)
	w.WriteHeader(http.StatusNoContent)
}

// adminLogoutUser forcibly ends every session for the target user by revoking all
// of their refresh tokens. The user's current access token keeps working until it
// expires (at most AccessTokenTTL); after that they can no longer refresh and are
// fully logged out.
func (h *Handler) adminLogoutUser(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}
	user := h.adminFindVisibleUser(w, claims, r.PathValue("id"), "adminLogoutUser")
	if user == nil {
		return
	}

	if err := h.refreshTokens.DeleteByUserID(user.ID); err != nil {
		log.Printf("adminLogoutUser revoke %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("admin force-logged-out user %s (%s)", user.ID, user.Email)
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

// dedupeRoles returns roles with blanks and duplicates removed, order preserved,
// so a request cannot smuggle a grant past a check by repeating it.
func dedupeRoles(roles []string) []string {
	seen := make(map[string]bool, len(roles))
	out := make([]string, 0, len(roles))
	for _, r := range roles {
		r = strings.TrimSpace(r)
		if r == "" || seen[r] {
			continue
		}
		seen[r] = true
		out = append(out, r)
	}
	return out
}

// changedRoles returns the roles being added together with those being removed —
// the symmetric difference, which is exactly the set the caller must be entitled
// to grant or revoke.
func changedRoles(current, next []string) []string {
	var changed []string
	for _, r := range next {
		if !containsRole(current, r) {
			changed = append(changed, r)
		}
	}
	for _, r := range current {
		if !containsRole(next, r) {
			changed = append(changed, r)
		}
	}
	return changed
}

// adminGetUser returns a single user, so a page addressed by its own URL can
// stand up without having arrived from the listing first — a bookmarked link, or
// a reload, has to work the same as a click.
func (h *Handler) adminGetUser(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}
	user := h.adminFindVisibleUser(w, claims, r.PathValue("id"), "adminGetUser")
	if user == nil {
		return
	}
	writeJSON(w, h.asAdminUser(user))
}

// adminBranchMembers lists the members of one branch. It is the listing the
// admin pages actually navigate by: a flat roll of everyone a WSKO admin may see
// is a poor way to find the four people in a club, and the alternative — fetch
// everything and filter in the browser — would send every one of those records
// to a screen that wanted one branch's worth.
//
// A branch the caller does not cover is reported as not found rather than
// forbidden, for the same reason the user lookup is: a 403 would confirm which
// ids name real branches to somebody with no business knowing.
func (h *Handler) adminBranchMembers(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}
	id := r.PathValue("id")
	branch, ok := h.orgs.Branch(id)
	if !ok || !h.covers(claims, authz.Branch(id)) {
		http.Error(w, "branch not found", http.StatusNotFound)
		return
	}

	users, err := h.users.ListByBranches([]string{id})
	if err != nil {
		log.Printf("adminBranchMembers %s: %v", id, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	out := make([]adminUser, 0, len(users))
	for _, u := range users {
		out = append(out, h.asAdminUser(u))
	}
	// The branch names itself in the response so a page opened straight from a
	// bookmark can say whose members these are without a second request.
	writeJSON(w, branchMembersResponse{ID: branch.ID, Name: branch.Name, FederationID: branch.FederationID, Members: out})
}

// asAdminUser dresses a stored user in what the admin pages need: the roles,
// which live apart from the user record, and whether an identity provider owns
// the display name.
func (h *Handler) asAdminUser(u *store.User) adminUser {
	roles := h.rolesFor(u.Email)
	if roles == nil {
		roles = []string{} // marshal as [] rather than null
	}
	return adminUser{User: u, Roles: roles, OIDC: hasOIDCIdentity(u)}
}

// branchMembersResponse is one branch and everybody in it.
type branchMembersResponse struct {
	ID           string      `json:"id"`
	Name         string      `json:"name"`
	FederationID string      `json:"federationId,omitempty"`
	Members      []adminUser `json:"members"`
}
