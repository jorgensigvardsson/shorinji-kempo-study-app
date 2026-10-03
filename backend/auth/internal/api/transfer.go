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
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/logsafe"
)

// Branch transfers: a member has moved to another town and asks the club there
// to take them in.
//
// The member asks for themselves. There is no handshake with the branch they are
// leaving — the kenshi is the one who moved, the receiving branch decides, and
// the old branch is told rather than asked. It is also the arrangement that
// cannot strand anybody: a club that never answers its mail can hold nobody.

// transferView is a member's own transfer as they see it. It carries the
// destination's name because the member picked it from a list of names, and
// should not have to fetch that list again to read their own request back.
type transferView struct {
	ToBranchID   string `json:"toBranchId"`
	ToBranchName string `json:"toBranchName"`
	Note         string `json:"note,omitempty"`
	Status       string `json:"status"`
	CreatedAt    string `json:"createdAt"`
	DecidedAt    string `json:"decidedAt,omitempty"`
}

// myTransfer returns the caller's own transfer request, or 204 when they have
// none. A refused one is returned too, until it expires: being told no is part of
// what a member is entitled to see about themselves.
func (h *Handler) myTransfer(w http.ResponseWriter, r *http.Request) {
	claims, err := h.claimsFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	transfer, err := h.transfers.Get(claims.Subject)
	if err != nil {
		log.Printf("myTransfer: lookup %s: %v", claims.Subject, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if transfer == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, transferView{
		ToBranchID:   transfer.ToBranchID,
		ToBranchName: h.branchName(transfer.ToBranchID),
		Note:         transfer.Note,
		Status:       transfer.Status,
		CreatedAt:    transfer.CreatedAt,
		DecidedAt:    transfer.DecidedAt,
	})
}

// requestTransfer records a member asking to move, and tells the branch they are
// asking to join.
func (h *Handler) requestTransfer(w http.ResponseWriter, r *http.Request) {
	claims, err := h.claimsFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		ToBranchID string `json:"toBranchId"`
		Note       string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	destination := strings.TrimSpace(req.ToBranchID)
	note := strings.TrimSpace(req.Note)
	if len(note) > maxNoteLength {
		note = note[:maxNoteLength]
	}
	if _, ok := h.orgs.Branch(destination); !ok {
		http.Error(w, "no such branch", http.StatusBadRequest)
		return
	}

	user, err := h.users.FindByID(claims.Subject)
	if err != nil || user == nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	if user.BranchID == destination {
		// Not an error worth a page of its own, but not a request either: there
		// is nothing for anybody to decide.
		http.Error(w, "already a member of that branch", http.StatusConflict)
		return
	}

	existing, err := h.transfers.Get(user.ID)
	if err != nil {
		log.Printf("requestTransfer: lookup %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if existing.IsPending() {
		// One at a time. Two clubs deciding the same member's future
		// independently is a race nobody asked for.
		writeJSONStatus(w, http.StatusConflict, map[string]string{"reason": "pending"})
		return
	}

	transfer := &store.TransferRequest{
		ID:           user.ID,
		FromBranchID: user.BranchID,
		ToBranchID:   destination,
		Note:         note,
		Status:       store.TransferPending,
		CreatedAt:    time.Now().UTC().Format(time.RFC3339),
	}
	// A member who was refused before and asks again arrives with that history
	// attached, so the next admin is not judging blind — and so the record of the
	// refusal does not quietly outlive the question it answered.
	if existing != nil && existing.Status == store.TransferRejected {
		transfer.PreviouslyRejectedAt = existing.DecidedAt
	}
	if err := h.transfers.Save(transfer); err != nil {
		log.Printf("requestTransfer: save %s: %v", user.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("member %s asked to transfer from %q to %q", user.ID, user.BranchID, destination)

	h.announceTransfer(user, transfer)
	w.WriteHeader(http.StatusNoContent)
}

// withdrawTransfer lets a member take back a request they have not had answered.
// A refused one can be cleared the same way — there is no reason to make somebody
// live with the record of being told no.
func (h *Handler) withdrawTransfer(w http.ResponseWriter, r *http.Request) {
	claims, err := h.claimsFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if err := h.transfers.Delete(claims.Subject); err != nil {
		log.Printf("withdrawTransfer %s: %v", claims.Subject, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// adminTransfer is a pending transfer as the admins who may decide it see it.
type adminTransfer struct {
	ID                   string `json:"id"` // the member's user id
	MemberName           string `json:"memberName"`
	MemberEmail          string `json:"memberEmail"`
	FromBranchID         string `json:"fromBranchId,omitempty"`
	FromBranchName       string `json:"fromBranchName,omitempty"`
	ToBranchID           string `json:"toBranchId"`
	ToBranchName         string `json:"toBranchName"`
	Note                 string `json:"note,omitempty"`
	CreatedAt            string `json:"createdAt"`
	PreviouslyRejectedAt string `json:"previouslyRejectedAt,omitempty"`
}

// adminListTransfers returns the pending transfers into branches the caller
// covers. Transfers *out* of their branches are deliberately absent: the old
// branch is told when it happens and has nothing to decide, so a queue would
// only invite them to try.
func (h *Handler) adminListTransfers(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}
	all, err := h.transfers.List()
	if err != nil {
		log.Printf("adminListTransfers: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	out := make([]adminTransfer, 0, len(all))
	for _, t := range all {
		if !t.IsPending() || !h.covers(claims, authz.Branch(t.ToBranchID)) {
			continue
		}
		member, err := h.users.FindByID(t.ID)
		if err != nil || member == nil {
			// The member deleted their account while waiting. Nothing left to
			// decide, and nobody to tell.
			continue
		}
		out = append(out, adminTransfer{
			ID:                   t.ID,
			MemberName:           member.DisplayName,
			MemberEmail:          member.Email,
			FromBranchID:         t.FromBranchID,
			FromBranchName:       h.branchName(t.FromBranchID),
			ToBranchID:           t.ToBranchID,
			ToBranchName:         h.branchName(t.ToBranchID),
			Note:                 t.Note,
			CreatedAt:            t.CreatedAt,
			PreviouslyRejectedAt: t.PreviouslyRejectedAt,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt < out[j].CreatedAt })
	writeJSON(w, out)
}

// adminAcceptTransfer moves the member and tells everybody who should know.
func (h *Handler) adminAcceptTransfer(w http.ResponseWriter, r *http.Request) {
	claims, transfer, member := h.transferToDecide(w, r, "adminAcceptTransfer")
	if transfer == nil {
		return
	}

	// Where they are actually leaving from, read now rather than taken from the
	// request: if an admin moved them while this waited, that is the club losing
	// a member.
	leaving := member.BranchID
	member.BranchID = transfer.ToBranchID
	if err := h.users.Save(member); err != nil {
		log.Printf("adminAcceptTransfer: move %s: %v", member.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	// The member is moved before the request is deleted, so a failure here leaves
	// a decided transfer rather than a member in neither club.
	if err := h.transfers.Delete(transfer.ID); err != nil {
		log.Printf("adminAcceptTransfer: clear %s: %v", transfer.ID, err)
	}
	log.Printf("admin %s accepted the transfer of %s from %q to %q",
		claims.Subject, member.ID, leaving, transfer.ToBranchID)

	// Their token still says the old branch for up to an hour. Nothing in the app
	// turns on it that a member could not do anyway, so it is left to expire
	// rather than forcing them off every device over a piece of good news.
	h.announceTransferDecision(member, transfer, leaving, true)
	w.WriteHeader(http.StatusNoContent)
}

// adminRejectTransfer refuses the move, keeping the refusal for a bounded time so
// that asking again arrives with its history.
func (h *Handler) adminRejectTransfer(w http.ResponseWriter, r *http.Request) {
	claims, transfer, member := h.transferToDecide(w, r, "adminRejectTransfer")
	if transfer == nil {
		return
	}

	transfer.Status = store.TransferRejected
	transfer.DecidedAt = time.Now().UTC().Format(time.RFC3339)
	transfer.DecidedBy = claims.Subject
	transfer.TTL = store.RejectedTransferTTL
	if err := h.transfers.Save(transfer); err != nil {
		log.Printf("adminRejectTransfer: save %s: %v", transfer.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("admin %s refused the transfer of %s to %q", claims.Subject, member.ID, transfer.ToBranchID)

	h.announceTransferDecision(member, transfer, member.BranchID, false)
	w.WriteHeader(http.StatusNoContent)
}

// transferToDecide resolves the target of an accept or reject: the request, the
// member it concerns, and the caller's authority over the branch being asked to
// take them. A transfer the caller may not decide is reported as not found, for
// the same reason a user outside their scope is — a 403 would confirm that a
// particular member is trying to leave.
func (h *Handler) transferToDecide(w http.ResponseWriter, r *http.Request, what string) (*token.Claims, *store.TransferRequest, *store.User) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return nil, nil, nil
	}
	id := r.PathValue("id")
	transfer, err := h.transfers.Get(id)
	if err != nil {
		log.Printf("%s: lookup %s: %v", what, id, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil, nil, nil
	}
	if !transfer.IsPending() || !h.covers(claims, authz.Branch(transfer.ToBranchID)) {
		http.Error(w, "transfer request not found", http.StatusNotFound)
		return nil, nil, nil
	}
	member, err := h.users.FindByID(transfer.ID)
	if err != nil || member == nil {
		http.Error(w, "transfer request not found", http.StatusNotFound)
		return nil, nil, nil
	}
	return claims, transfer, member
}

// announceTransfer tells the branch being asked. Best-effort, like every other
// mail here: a relay that is down must not undo a request already recorded.
func (h *Handler) announceTransfer(member *store.User, transfer *store.TransferRequest) {
	recipients, err := h.adminsForBranch(transfer.ToBranchID)
	if err != nil {
		log.Printf("requestTransfer: resolve recipients for branch %s: %v", transfer.ToBranchID, err)
		return
	}
	if len(recipients) == 0 {
		log.Printf("WARNING: transfer request from %s for branch %s has nobody to notify",
			member.Email, transfer.ToBranchID)
		return
	}

	notice := email.TransferNotice{
		MemberName:           member.DisplayName,
		MemberEmail:          member.Email,
		FromBranchName:       h.branchName(transfer.FromBranchID),
		ToBranchName:         h.branchName(transfer.ToBranchID),
		Note:                 transfer.Note,
		PreviouslyRejectedAt: transfer.PreviouslyRejectedAt,
	}
	ctx := context.Background()
	for _, group := range h.groupByLanguage(recipients) {
		if err := h.mailer.SendTransferRequestNotice(ctx, group.addresses, group.language, notice); err != nil {
			log.Printf("requestTransfer: notify %v: %v", group.addresses, err)
		}
	}
}

// announceTransferDecision tells the member what was decided, and — when they
// have actually moved — the branch they left.
func (h *Handler) announceTransferDecision(member *store.User, transfer *store.TransferRequest, leaving string, accepted bool) {
	ctx := context.Background()
	if err := h.mailer.SendTransferDecision(ctx, member.Email, h.branchName(transfer.ToBranchID),
		member.Language, accepted); err != nil {
		log.Printf("transfer decision to %s: %v", logsafe.Email(member.Email), err)
	}
	if !accepted || leaving == "" || leaving == transfer.ToBranchID {
		return
	}

	recipients, err := h.adminsForBranch(leaving)
	if err != nil {
		log.Printf("transfer departure: resolve recipients for branch %s: %v", leaving, err)
		return
	}
	// The receiving branch's admins already know — they just decided it — so
	// telling them again as "somebody left" would be noise.
	notice := email.DepartureNotice{
		MemberName:     member.DisplayName,
		MemberEmail:    member.Email,
		FromBranchName: h.branchName(leaving),
		ToBranchName:   h.branchName(transfer.ToBranchID),
	}
	for _, group := range h.groupByLanguage(recipients) {
		if err := h.mailer.SendTransferDeparture(ctx, group.addresses, group.language, notice); err != nil {
			log.Printf("transfer departure: notify %v: %v", group.addresses, err)
		}
	}
}

// adminMoveUser moves a member to another branch on an admin's say-so, with no
// request from the member and nobody else to decide. It is the other way into
// a branch from a transfer: somebody who registered with the wrong club, or an
// instructor tidying up after a club has split, should not have to ask a member
// to apply for where they already train.
//
// The caller must cover both ends — the branch the member leaves and the one
// they join — and that is the whole rule. A federation admin covers every
// branch in their federation and so moves members within it; a WSKO or global
// admin covers everything and so moves anybody anywhere; a branch admin covers
// one branch, both ends of which are the same, and so moves nobody.
func (h *Handler) adminMoveUser(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}

	var req struct {
		BranchID string `json:"branchId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	destination := strings.TrimSpace(req.BranchID)

	// The end they leave: a member the caller cannot see is one they cannot move.
	member := h.adminFindVisibleUser(w, claims, r.PathValue("id"), "adminMoveUser")
	if member == nil {
		return
	}
	// The end they join. Not found rather than forbidden, for the reason every
	// other branch lookup here gives: a 403 would confirm which ids are real.
	if _, ok := h.orgs.Branch(destination); !ok || !h.covers(claims, authz.Branch(destination)) {
		http.Error(w, "branch not found", http.StatusNotFound)
		return
	}
	if member.BranchID == destination {
		http.Error(w, "already a member of that branch", http.StatusConflict)
		return
	}

	leaving := member.BranchID
	member.BranchID = destination
	if err := h.users.Save(member); err != nil {
		log.Printf("adminMoveUser: move %s: %v", member.ID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	log.Printf("admin %s moved %s from %q to %q", claims.Subject, member.ID, leaving, destination)

	// A transfer the member had pending to the branch they have just been put in
	// has been answered, by somebody other than the club it asked. One to some
	// third branch is left alone: it is still the member's question, and the
	// branch it asked can still say yes.
	if pending, err := h.transfers.Get(member.ID); err != nil {
		log.Printf("adminMoveUser: transfer lookup %s: %v", member.ID, err)
	} else if pending.IsPending() && pending.ToBranchID == destination {
		if err := h.transfers.Delete(member.ID); err != nil {
			log.Printf("adminMoveUser: clear transfer %s: %v", member.ID, err)
		}
	}

	// The move stands whether or not the mail goes out, but the admin is told
	// which it was — as when they create an account — rather than left to assume
	// the member knows.
	notified := true
	if err := h.mailer.SendMovedByAdmin(context.Background(), member.Email,
		h.branchName(leaving), h.branchName(destination), member.Language); err != nil {
		log.Printf("adminMoveUser: notify %s: %v", logsafe.Email(member.Email), err)
		notified = false
	}
	h.announceMove(member, leaving, destination, claims.Email)
	writeJSON(w, movedUserResponse{Notified: notified})
}

// announceMove tells the admins at both ends of a move made on an admin's
// say-so: the branch losing a member, and the branch gaining one it never
// decided to take. Best-effort, like every notice to admins — the move has
// happened, and a relay that is down must not make it look otherwise.
//
// Only the branches' own admins are told. Unlike a join or transfer request,
// nothing here waits on an answer, so there is no reason for adminsForBranch's
// climb to the federation and WSKO: a branch with no admin of its own simply
// has nobody to tell, and those further up have no use for the news.
//
// The admin who made the move is left out, and so is the member, should they
// administer either branch: both already know, and each has had the one message
// that is theirs.
func (h *Handler) announceMove(member *store.User, leaving, destination, actor string) {
	ctx := context.Background()
	records, err := h.roles.ListAll()
	if err != nil {
		log.Printf("adminMoveUser: resolve branch admins: %v", err)
		return
	}
	recipients := func(branchID string) []string {
		var out []string
		for _, rec := range records {
			if rec.ID == "" || !containsRole(rec.Roles, authz.BranchAdmin(branchID)) {
				continue
			}
			if !strings.EqualFold(rec.ID, actor) && !strings.EqualFold(rec.ID, member.Email) {
				out = append(out, rec.ID)
			}
		}
		sort.Strings(out) // deterministic, so a test can say what it expects
		return out
	}
	from, to := h.branchName(leaving), h.branchName(destination)

	// A member who belonged to no branch left nobody behind to tell.
	if leaving != "" {
		departure := email.DepartureNotice{
			MemberName:     member.DisplayName,
			MemberEmail:    member.Email,
			FromBranchName: from,
			ToBranchName:   to,
			ByAdmin:        true,
		}
		for _, group := range h.groupByLanguage(recipients(leaving)) {
			if err := h.mailer.SendTransferDeparture(ctx, group.addresses, group.language, departure); err != nil {
				log.Printf("adminMoveUser: departure notice %v: %v", group.addresses, err)
			}
		}
	}

	arrival := email.ArrivalNotice{
		MemberName:     member.DisplayName,
		MemberEmail:    member.Email,
		FromBranchName: from,
		ToBranchName:   to,
	}
	for _, group := range h.groupByLanguage(recipients(destination)) {
		if err := h.mailer.SendMemberArrival(ctx, group.addresses, group.language, arrival); err != nil {
			log.Printf("adminMoveUser: arrival notice %v: %v", group.addresses, err)
		}
	}
}

// movedUserResponse says whether the member was told they have been moved.
type movedUserResponse struct {
	Notified bool `json:"notified"`
}

// branchName resolves a branch id for display, falling back to nothing rather
// than to the id: an id in a sentence tells a reader less than no clause at all.
func (h *Handler) branchName(id string) string {
	if id == "" {
		return ""
	}
	if branch, ok := h.orgs.Branch(id); ok {
		return branch.Name
	}
	return ""
}
