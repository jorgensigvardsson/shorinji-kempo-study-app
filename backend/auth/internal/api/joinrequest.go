package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/email"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/token"
)

// maxNoteLength bounds the applicant's own words. Long enough to say who you are
// and when you train, short enough that the field is not a channel.
const maxNoteLength = 500

// joinRequestRecipients returns the addresses to tell about a request for a
// branch: the branch's own admins, failing that the federation's, failing that
// the global admins.
//
// The fallback is the point. On the day this ships exactly one branch has an
// admin, so notifying branch admins alone would mean almost every request
// arriving nowhere — and a request nobody is told about is a person left waiting
// with no way to tell the difference between "not yet" and "never". There is
// always at least one global admin, so the chain always ends somewhere.
func (h *Handler) joinRequestRecipients(branchID string) ([]string, error) {
	records, err := h.roles.ListAll()
	if err != nil {
		return nil, err
	}
	federation := h.orgs.FederationOf(branchID)

	var branchAdmins, federationAdmins, globalAdmins []string
	for _, rec := range records {
		if rec.ID == "" {
			continue
		}
		switch {
		case containsRole(rec.Roles, authz.BranchAdmin(branchID)):
			branchAdmins = append(branchAdmins, rec.ID)
		case federation != "" && containsRole(rec.Roles, authz.FederationAdmin(federation)):
			federationAdmins = append(federationAdmins, rec.ID)
		case containsRole(rec.Roles, authz.RoleAdmin) || containsRole(rec.Roles, authz.RoleWSKOAdmin):
			globalAdmins = append(globalAdmins, rec.ID)
		}
	}

	for _, tier := range [][]string{branchAdmins, federationAdmins, globalAdmins} {
		if len(tier) > 0 {
			sort.Strings(tier) // deterministic, so a test can say what it expects
			return tier, nil
		}
	}
	return nil, nil
}

// joinRequest records somebody asking to be let into a branch.
//
// It is authorized by the join ticket rather than by a session, because its
// entire audience is people who have proved an address and have no account. It
// carries a global rate limit on top of the per-IP one for the same reason
// /auth/email/start does: it sends mail, and a denied applicant may re-apply, so
// an admin's inbox is as much a quota as the relay is.
func (h *Handler) joinRequest(w http.ResponseWriter, r *http.Request) {
	ticket, err := h.joinTicketFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		BranchID string `json:"branchId"`
		Name     string `json:"name"`
		Note     string `json:"note"`
		Language string `json:"language"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(req.Name)
	note := strings.TrimSpace(req.Note)
	if name == "" {
		name = strings.TrimSpace(ticket.Name)
	}
	if name == "" {
		http.Error(w, "a name is required", http.StatusBadRequest)
		return
	}
	if len([]rune(note)) > maxNoteLength {
		http.Error(w, "the note is too long", http.StatusBadRequest)
		return
	}
	branch, ok := h.orgs.Branch(strings.TrimSpace(req.BranchID))
	if !ok {
		http.Error(w, "no such branch", http.StatusBadRequest)
		return
	}

	// An address that already has an account is not an applicant. Answering
	// "conflict" rather than creating a second route in is deliberate: the remedy
	// is to sign in, which they can already do.
	if existing, err := h.users.FindByLinkedIdentity(ticket.Provider, ticket.Sub); err != nil {
		log.Printf("joinRequest: user lookup: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	} else if existing != nil {
		writeJSONStatus(w, http.StatusConflict, map[string]string{"reason": "account_exists"})
		return
	}

	previouslyDeniedAt := ""
	if prior, err := h.joinRequests.Get(ticket.Email); err != nil {
		log.Printf("joinRequest: existing request lookup: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	} else if prior != nil {
		if prior.IsPending() {
			writeJSONStatus(w, http.StatusConflict, map[string]string{"reason": "pending"})
			return
		}
		// Re-applying after a denial is allowed — an admin may simply have
		// clicked the wrong thing — but the next one to look should know.
		previouslyDeniedAt = prior.DecidedAt
	}

	now := time.Now().UTC().Format(time.RFC3339)
	request := &store.JoinRequest{
		ID:                 store.NormalizeEmail(ticket.Email),
		Email:              ticket.Email,
		Name:               name,
		Note:               note,
		BranchID:           branch.ID,
		Provider:           ticket.Provider,
		Sub:                ticket.Sub,
		Language:           normalizeLang(req.Language),
		Status:             store.JoinPending,
		CreatedAt:          now,
		PreviouslyDeniedAt: previouslyDeniedAt,
	}
	if err := h.joinRequests.Save(request); err != nil {
		log.Printf("joinRequest: save: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// The ticket is spent: it bought exactly one request.
	h.clearJoinTicket(w)
	log.Printf("join request from %s for branch %s (%s)", request.Email, branch.ID, branch.Name)

	h.announceJoinRequest(request, branch.Name)
	w.WriteHeader(http.StatusNoContent)
}

// announceJoinRequest mails the admins who will decide, and the applicant to say
// the request landed. Mail is best-effort: a relay that is down must not undo a
// request that is already recorded, since the applicant would only make it again.
func (h *Handler) announceJoinRequest(request *store.JoinRequest, branchName string) {
	ctx := context.Background()

	recipients, err := h.joinRequestRecipients(request.BranchID)
	if err != nil {
		log.Printf("joinRequest: resolve recipients for branch %s: %v", request.BranchID, err)
	} else if len(recipients) == 0 {
		// Only reachable with no global admin at all, which is a broken
		// deployment rather than a state to design for — but it is silent
		// otherwise, and silence is the failure that matters here.
		log.Printf("WARNING: join request from %s for branch %s has nobody to notify",
			request.Email, request.BranchID)
	} else if err := h.mailer.SendJoinRequestNotice(ctx, recipients, email.JoinRequestNotice{
		ApplicantName:      request.Name,
		ApplicantEmail:     request.Email,
		BranchName:         branchName,
		Note:               request.Note,
		PreviouslyDeniedAt: request.PreviouslyDeniedAt,
	}); err != nil {
		log.Printf("joinRequest: notify %v: %v", recipients, err)
	}

	if err := h.mailer.SendJoinReceived(ctx, request.Email, branchName, request.Language); err != nil {
		log.Printf("joinRequest: acknowledge to %s: %v", request.Email, err)
	}
}

// joinWithdraw lets an applicant take back a pending request, which is also how
// they exercise erasure: nothing of theirs is held afterwards.
func (h *Handler) joinWithdraw(w http.ResponseWriter, r *http.Request) {
	ticket, err := h.joinTicketFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	existing, err := h.joinRequests.Get(ticket.Email)
	if err != nil {
		log.Printf("joinWithdraw: lookup: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	// Only a pending request is the applicant's to withdraw; a denied one is a
	// record of a decision somebody else made.
	if existing == nil || !existing.IsPending() {
		http.Error(w, "no pending request", http.StatusNotFound)
		return
	}
	if err := h.joinRequests.Delete(ticket.Email); err != nil {
		log.Printf("joinWithdraw: delete: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("join request from %s withdrawn", ticket.Email)
	w.WriteHeader(http.StatusNoContent)
}

// adminRequest is one pending request as an admin sees it.
type adminRequest struct {
	Email              string `json:"email"`
	Name               string `json:"name"`
	Note               string `json:"note,omitempty"`
	BranchID           string `json:"branchId"`
	BranchName         string `json:"branchName"`
	CreatedAt          string `json:"createdAt"`
	PreviouslyDeniedAt string `json:"previouslyDeniedAt,omitempty"`
}

// adminListRequests returns the pending requests for every branch the caller
// administers. Denied ones are not listed: they are kept so that a
// re-application can be recognised, not so that refusals can be browsed.
func (h *Handler) adminListRequests(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}
	all, err := h.joinRequests.List()
	if err != nil {
		log.Printf("adminListRequests: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	out := make([]adminRequest, 0, len(all))
	for _, req := range all {
		if !req.IsPending() || !h.covers(claims, authz.Branch(req.BranchID)) {
			continue
		}
		name := ""
		if branch, ok := h.orgs.Branch(req.BranchID); ok {
			name = branch.Name
		}
		out = append(out, adminRequest{
			Email: req.Email, Name: req.Name, Note: req.Note,
			BranchID: req.BranchID, BranchName: name,
			CreatedAt: req.CreatedAt, PreviouslyDeniedAt: req.PreviouslyDeniedAt,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt < out[j].CreatedAt })
	writeJSON(w, out)
}

// adminDecideRequest reads the request named in the path and checks the caller
// may decide it, writing the refusal itself when they may not. A request outside
// the caller's scope is 404 for the same reason a user outside it is.
func (h *Handler) adminDecideRequest(w http.ResponseWriter, r *http.Request, claims *token.Claims) *store.JoinRequest {
	request, err := h.joinRequests.Get(r.PathValue("email"))
	if err != nil {
		log.Printf("adminDecideRequest: lookup: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil
	}
	if request == nil || !request.IsPending() || !h.covers(claims, authz.Branch(request.BranchID)) {
		http.Error(w, "request not found", http.StatusNotFound)
		return nil
	}
	return request
}

// adminApproveRequest admits the applicant: it creates the user, links the
// identity that proved the address, and deletes the request. The request is
// deleted rather than marked, so no applicant's details linger once the account
// they became supersedes them.
func (h *Handler) adminApproveRequest(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}
	request := h.adminDecideRequest(w, r, claims)
	if request == nil {
		return
	}

	id, err := store.NewUUID()
	if err != nil {
		log.Printf("adminApproveRequest: uuid: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	user := &store.User{
		ID:          id,
		Email:       request.Email,
		DisplayName: request.Name,
		BranchID:    request.BranchID,
		LinkedIdentities: map[string]store.LinkedIdentity{
			request.Provider: {Sub: request.Sub, Email: request.Email},
		},
		CreatedAt: now,
	}
	if err := h.users.Save(user); err != nil {
		log.Printf("adminApproveRequest: create user for %s: %v", request.Email, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	// Only now is the request redundant. Deleting it first would risk losing the
	// applicant entirely if the user write then failed.
	if err := h.joinRequests.Delete(request.ID); err != nil {
		log.Printf("adminApproveRequest: delete request %s: %v", request.ID, err)
	}

	log.Printf("admin %s approved %s into branch %s (user %s)", claims.Subject, request.Email, request.BranchID, user.ID)
	h.mailDecision(request, true)
	w.WriteHeader(http.StatusNoContent)
}

// adminDenyRequest turns the applicant down. The record is kept, with a ttl, so
// that a re-application can be recognised as one — and only for as long as that
// is useful, since it is somebody's name and address held on somebody who is not
// a user.
func (h *Handler) adminDenyRequest(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}
	request := h.adminDecideRequest(w, r, claims)
	if request == nil {
		return
	}

	request.Status = store.JoinDenied
	request.DecidedAt = time.Now().UTC().Format(time.RFC3339)
	request.DecidedBy = claims.Subject
	request.TTL = store.DeniedRequestTTL
	if err := h.joinRequests.Save(request); err != nil {
		log.Printf("adminDenyRequest: save %s: %v", request.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	log.Printf("admin %s declined %s for branch %s", claims.Subject, request.Email, request.BranchID)
	h.mailDecision(request, false)
	w.WriteHeader(http.StatusNoContent)
}

// mailDecision tells the applicant, best-effort. The decision is already made
// and recorded; a relay being down does not un-make it, and the applicant can be
// told again by a human if it comes to that.
func (h *Handler) mailDecision(request *store.JoinRequest, approved bool) {
	branchName := ""
	if branch, ok := h.orgs.Branch(request.BranchID); ok {
		branchName = branch.Name
	}
	if err := h.mailer.SendJoinDecision(context.Background(), request.Email, branchName, request.Language, approved); err != nil {
		log.Printf("join decision mail to %s: %v", request.Email, err)
	}
}
