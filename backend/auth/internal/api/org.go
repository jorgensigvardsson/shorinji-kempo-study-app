package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/token"
)

// orgBranch is a branch as the admin tree renders it — the federation is implied
// by where it sits, so it is not repeated on every node.
type orgBranch struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type orgFederation struct {
	ID       string      `json:"id"`
	Name     string      `json:"name"`
	Branches []orgBranch `json:"branches"`
}

// orgTreeResponse keeps WSKO-attached branches in a group of their own rather
// than mixed in or left out. They belong to no federation, which is a real place
// in the organization and not an absence: a listing that simply omitted them
// would read as though those branches had gone missing.
type orgTreeResponse struct {
	Federations  []orgFederation `json:"federations"`
	WSKOBranches []orgBranch     `json:"wskoBranches"`
}

// publicBranch is the shape the branch picker gets before anybody has an
// account. It carries the federation's name so the picker can group without a
// second request, and nothing else — no admins, no members, no counts.
type publicBranch struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	FederationID   string `json:"federationId,omitempty"`
	FederationName string `json:"federationName,omitempty"`
}

// publicBranches lists every branch, unauthenticated. This is what somebody
// registering picks from, so it necessarily precedes having a session.
//
// Club lists are public information — federations publish them — and the
// response carries no personal data of any kind. It rides the same per-IP rate
// limiter as every other endpoint.
func (h *Handler) publicBranches(w http.ResponseWriter, r *http.Request) {
	branches := h.orgs.Branches()
	out := make([]publicBranch, 0, len(branches))
	for _, b := range branches {
		entry := publicBranch{ID: b.ID, Name: b.Name, FederationID: b.FederationID}
		if b.FederationID != "" {
			if fed, ok := h.orgs.Federation(b.FederationID); ok {
				entry.FederationName = fed.Name
			}
		}
		out = append(out, entry)
	}
	writeJSON(w, out)
}

// adminOrgTree returns the organization as the caller may see it: a WSKO admin
// gets all of it, a federation admin their own federation, a branch admin their
// own branch under the federation it belongs to — the parent is included for
// context, since its name is public anyway and a branch floating with no heading
// tells the reader nothing.
func (h *Handler) adminOrgTree(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}
	// Branches first: a federation earns its place either by being covered
	// directly or by containing something the caller covers.
	branchesByFederation := map[string][]orgBranch{}
	wskoBranches := []orgBranch{}
	for _, b := range h.orgs.Branches() {
		if !h.covers(claims, authz.Branch(b.ID)) {
			continue
		}
		if b.FederationID == "" {
			wskoBranches = append(wskoBranches, orgBranch{ID: b.ID, Name: b.Name})
			continue
		}
		branchesByFederation[b.FederationID] = append(branchesByFederation[b.FederationID], orgBranch{ID: b.ID, Name: b.Name})
	}

	federations := []orgFederation{}
	for _, f := range h.orgs.Federations() {
		branches := branchesByFederation[f.ID]
		if branches == nil {
			if !h.covers(claims, authz.Federation(f.ID)) {
				continue // neither the federation nor anything in it
			}
			branches = []orgBranch{} // covered but empty, which is worth showing
		}
		federations = append(federations, orgFederation{ID: f.ID, Name: f.Name, Branches: branches})
	}

	writeJSON(w, orgTreeResponse{Federations: federations, WSKOBranches: wskoBranches})
}

// createFederation adds a national federation. Creating one is a WSKO-level act:
// federations are peers of each other, and no federation admin is above another.
func (h *Handler) createFederation(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}
	if !h.covers(claims, authz.WSKO()) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var req struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	id := strings.ToUpper(strings.TrimSpace(req.ID))
	name := strings.TrimSpace(req.Name)
	if !store.ValidFederationID(id) {
		http.Error(w, "federation id must be an ISO 3166-1 alpha-2 country code", http.StatusBadRequest)
		return
	}
	if name == "" {
		http.Error(w, "federation name is required", http.StatusBadRequest)
		return
	}
	if _, exists := h.orgs.Node(id); exists {
		http.Error(w, "a federation with that id already exists", http.StatusConflict)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	node := &store.OrgNode{ID: id, Type: store.NodeFederation, Name: name, CreatedAt: now, UpdatedAt: now}
	if err := h.orgs.Save(node); err != nil {
		log.Printf("createFederation %s: %v", id, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("admin %s created federation %s (%s)", claims.Subject, id, name)
	writeJSONStatus(w, http.StatusCreated, node)
}

// renameFederation changes a federation's name. Only its own admins and above.
func (h *Handler) renameFederation(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}
	id := r.PathValue("id")

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		http.Error(w, "federation name is required", http.StatusBadRequest)
		return
	}

	node, ok := h.orgs.Federation(id)
	if !ok || !h.covers(claims, authz.Federation(id)) {
		http.Error(w, "federation not found", http.StatusNotFound)
		return
	}

	node.Name = name
	node.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := h.orgs.Save(&node); err != nil {
		log.Printf("renameFederation %s: %v", id, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("admin %s renamed federation %s to %q", claims.Subject, id, name)
	writeJSON(w, node)
}

// createBranch adds a branch, either inside a federation or attached directly to
// WSKO. Which one is decided by the body rather than inferred from the caller:
// an omitted federationId means WSKO-attached, and needs WSKO authority to
// create. A federation admin names their own federation explicitly — the UI
// knows it, and rewriting a request to fit the requester's authority would be a
// worse habit than refusing one that exceeds it.
func (h *Handler) createBranch(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}

	var req struct {
		Name         string `json:"name"`
		FederationID string `json:"federationId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(req.Name)
	federationID := strings.TrimSpace(req.FederationID)
	if name == "" {
		http.Error(w, "branch name is required", http.StatusBadRequest)
		return
	}
	if !h.mayPlaceBranchIn(w, claims, federationID) {
		return
	}

	id, err := store.NewUUID()
	if err != nil {
		log.Printf("createBranch uuid: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	node := &store.OrgNode{
		ID: id, Type: store.NodeBranch, Name: name, FederationID: federationID,
		CreatedAt: now, UpdatedAt: now,
	}
	if err := h.orgs.Save(node); err != nil {
		log.Printf("createBranch %s: %v", id, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("admin %s created branch %s (%s) in federation %q", claims.Subject, id, name, federationID)
	writeJSONStatus(w, http.StatusCreated, node)
}

// updateBranch renames a branch, moves it between federations, or both. Name and
// federationId are pointers so that "leave it alone" and "set it to WSKO" are
// different requests rather than the same empty string.
func (h *Handler) updateBranch(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}
	id := r.PathValue("id")

	var req struct {
		Name         *string `json:"name"`
		FederationID *string `json:"federationId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == nil && req.FederationID == nil {
		http.Error(w, "nothing to change", http.StatusBadRequest)
		return
	}

	node, ok := h.orgs.Branch(id)
	if !ok || !h.covers(claims, authz.Branch(id)) {
		http.Error(w, "branch not found", http.StatusNotFound)
		return
	}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			http.Error(w, "branch name is required", http.StatusBadRequest)
			return
		}
		node.Name = name
	}

	if req.FederationID != nil && strings.TrimSpace(*req.FederationID) != node.FederationID {
		destination := strings.TrimSpace(*req.FederationID)
		// A move is two acts, taking the branch out of one place and putting it
		// into another, and the caller must be entitled to both. In practice this
		// means only a WSKO admin can move a branch between federations — which
		// is the point: a federation admin should not be able to walk off with a
		// club, nor a branch admin to leave with themselves.
		if !h.mayPlaceBranchIn(w, claims, node.FederationID) || !h.mayPlaceBranchIn(w, claims, destination) {
			return
		}
		node.FederationID = destination
	}

	node.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := h.orgs.Save(&node); err != nil {
		log.Printf("updateBranch %s: %v", id, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("admin %s updated branch %s (name %q, federation %q)", claims.Subject, id, node.Name, node.FederationID)
	writeJSON(w, node)
}

// mayPlaceBranchIn reports whether the caller may put a branch into (or take one
// out of) a federation, writing the refusal itself when they may not. An empty
// federation id is WSKO — the root, not a missing value.
func (h *Handler) mayPlaceBranchIn(w http.ResponseWriter, claims *token.Claims, federationID string) bool {
	if federationID == "" {
		if !h.covers(claims, authz.WSKO()) {
			http.Error(w, "only a WSKO admin may attach a branch directly to WSKO", http.StatusForbidden)
			return false
		}
		return true
	}
	if _, ok := h.orgs.Federation(federationID); !ok {
		http.Error(w, "no such federation", http.StatusBadRequest)
		return false
	}
	if !h.covers(claims, authz.Federation(federationID)) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return false
	}
	return true
}
