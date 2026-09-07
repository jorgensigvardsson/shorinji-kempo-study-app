package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
)

// maxNameLength bounds the name an admin types for somebody else. No name needs
// more, and this one is stored and shown back to other people.
const maxNameLength = 100

// createdUserResponse is the account, plus whether the person it was made for
// has been told about it.
//
// The two are reported separately because they fail separately: the account is
// written first and the message goes out after, so a relay that is down leaves a
// real account nobody knows they have. That is worth saying out loud to the
// admin who just made it — they are the only one in a position to pick up the
// phone — rather than swallowing it into a log they will never read.
type createdUserResponse struct {
	adminUser
	Notified bool `json:"notified"`
}

// adminCreateUser makes an account for somebody who has not asked for one.
//
// It is the admin's side of the admission gate: joining normally starts with the
// member proving an address and a branch admitting them, which is the right shape
// for a stranger at the door and the wrong one for the twelve people an
// instructor already trains every Tuesday. Here the branch vouches first and the
// address is proved later — on the first sign-in, which claims the account (see
// claimInvitedAccount).
//
// The person is always mailed, because an account made in somebody's name
// without their knowledge is exactly the thing that must not happen quietly.
func (h *Handler) adminCreateUser(w http.ResponseWriter, r *http.Request) {
	claims := h.requireAnyAdmin(w, r)
	if claims == nil {
		return
	}

	var req struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		BranchID string `json:"branchId"`
		Language string `json:"language"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Parsed rather than pattern-matched: this address becomes a recipient
	// header, and mail.ParseAddress is the same check the sender applies before
	// it does. Its Address is taken, so "Anna <anna@example.org>" is stored as
	// the address alone rather than as a name that would never match a login.
	parsed, err := mail.ParseAddress(strings.TrimSpace(req.Email))
	if err != nil {
		writeJSONStatus(w, http.StatusBadRequest, map[string]string{"error": "invalid_email"})
		return
	}
	addr := store.NormalizeEmail(parsed.Address)

	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeJSONStatus(w, http.StatusBadRequest, map[string]string{"error": "name_required"})
		return
	}
	if len([]rune(name)) > maxNameLength {
		writeJSONStatus(w, http.StatusBadRequest, map[string]string{"error": "name_too_long"})
		return
	}

	// A branch outside the caller's authority answers exactly as one that does
	// not exist, for the same reason everywhere else in the admin API does: a 403
	// would confirm which ids name real branches to somebody with no business
	// knowing.
	branch, ok := h.orgs.Branch(strings.TrimSpace(req.BranchID))
	if !ok || !h.covers(claims, authz.Branch(branch.ID)) {
		http.Error(w, "branch not found", http.StatusNotFound)
		return
	}

	if existing, err := h.userWithEmail(addr); err != nil {
		log.Printf("adminCreateUser: duplicate check for %s: %v", addr, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	} else if existing != nil {
		// Deliberately answered even when the account sits in a branch this
		// caller cannot see. The alternative is a second account for one person,
		// which splits their notes and their grade across two logins that both
		// work — and the admin has just typed the address, so this tells them
		// nothing they were not already proposing.
		writeJSONStatus(w, http.StatusConflict, map[string]string{"reason": "account_exists"})
		return
	}

	id, err := store.NewUUID()
	if err != nil {
		log.Printf("adminCreateUser: uuid: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	user := &store.User{
		ID:          id,
		Email:       parsed.Address,
		DisplayName: name,
		BranchID:    branch.ID,
		// The one identity a manually created account starts with is a placeholder
		// naming the address it is waiting for. It is not a way to sign in — no
		// flow issues one — and it exists so that the first real sign-in can find
		// this record with a point read rather than a scan of every user.
		LinkedIdentities: map[string]store.LinkedIdentity{
			inviteProviderName: {Sub: addr, Email: parsed.Address},
		},
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		// A guess, and the only one available: the admin's own language. They are
		// in the same club and usually the same country, and the app overwrites
		// this with the truth the first time the member opens it.
		Language: normalizeLang(req.Language),
	}
	if err := h.users.Save(user); err != nil {
		log.Printf("adminCreateUser: save %s: %v", addr, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Somebody who applied and was then simply added has an application that no
	// longer means anything. Left behind it would sit in the admin queue until
	// approved — and approving it would mint a *second* account for the same
	// person, since approval creates rather than looks up.
	if prior, err := h.joinRequests.Get(addr); err != nil {
		log.Printf("adminCreateUser: request lookup for %s: %v", addr, err)
	} else if prior != nil {
		if err := h.joinRequests.Delete(addr); err != nil {
			log.Printf("adminCreateUser: delete superseded request for %s: %v", addr, err)
		} else {
			log.Printf("adminCreateUser: %s was added directly; their %s request is superseded", addr, prior.Status)
		}
	}

	log.Printf("admin %s created user %s (%s) in branch %s", claims.Subject, user.ID, addr, branch.ID)

	notified := true
	if err := h.mailer.SendAccountCreated(context.Background(), user.Email, branch.Name, user.Language); err != nil {
		log.Printf("adminCreateUser: notify %s: %v", addr, err)
		notified = false
	}
	writeJSONStatus(w, http.StatusCreated, createdUserResponse{adminUser: h.asAdminUser(user), Notified: notified})
}

// userWithEmail finds an account already using an address, whichever way it was
// made — the address on the record, or the one a provider reports for any
// identity linked to it.
//
// It is a full scan, which is worth being honest about. There is no index from
// address to user: the identity index is keyed by (provider, sub), and a Google
// account's sub is not its address, so the only lookup that catches every
// duplicate is this one. It runs when an admin adds a member by hand — a few
// times a term per branch — and what it buys is not a faster query but the
// absence of a second account for somebody who already has one.
func (h *Handler) userWithEmail(addr string) (*store.User, error) {
	users, err := h.users.List()
	if err != nil {
		return nil, err
	}
	for _, u := range users {
		if store.NormalizeEmail(u.Email) == addr {
			return u, nil
		}
		for _, identity := range u.LinkedIdentities {
			if store.NormalizeEmail(identity.Email) == addr {
				return u, nil
			}
		}
	}
	return nil, nil
}

// invitedAccount returns the unclaimed account an admin made for an address, if
// there is one. A point read against the identity index, exactly like any other
// identity lookup — which is the whole reason the placeholder identity exists.
func (h *Handler) invitedAccount(addr string) (*store.User, error) {
	return h.users.FindByLinkedIdentity(inviteProviderName, store.NormalizeEmail(addr))
}

// claimInvitedAccount hands a manually created account to the person it was made
// for, the first time they prove the address it names. The placeholder identity
// is replaced by the real one, so the account is claimed exactly once and every
// sign-in after this one is an ordinary lookup.
//
// The caller saves. Both sign-in paths already write the user record on their way
// to a session, so claiming is one more field changed on that write rather than a
// second one that could succeed on its own.
func (h *Handler) claimInvitedAccount(provider, sub, addr string) (*store.User, error) {
	user, err := h.invitedAccount(addr)
	if err != nil || user == nil {
		return nil, err
	}
	delete(user.LinkedIdentities, inviteProviderName)
	user.LinkedIdentities[provider] = store.LinkedIdentity{Sub: sub, Email: addr}
	log.Printf("account %s (%s), created by an admin, claimed via %s", user.ID, addr, provider)
	return user, nil
}
