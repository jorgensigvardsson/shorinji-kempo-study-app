package api

import (
	"log"
	"net/http"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/token"
)

// joinCookieName holds the join ticket between proving an address and asking to
// join a branch. It is scoped to /auth: the frontend never reads it — it cannot,
// being httpOnly — and only the join endpoints have any use for it.
const joinCookieName = "join_ticket"

// setJoinTicket hands back proof that an address was verified, for somebody who
// has no account and, for now, no way to get one except by asking.
func (h *Handler) setJoinTicket(w http.ResponseWriter, ticket token.JoinTicket) error {
	signed, err := h.tokens.IssueJoinTicket(ticket)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     joinCookieName,
		Value:    signed,
		Path:     "/auth",
		Domain:   h.cookieDomain,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(token.JoinTicketTTL.Seconds()),
	})
	return nil
}

// clearJoinTicket expires the cookie. Used once a request has been made, so a
// ticket cannot be spent twice.
func (h *Handler) clearJoinTicket(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     joinCookieName,
		Value:    "",
		Path:     "/auth",
		Domain:   h.cookieDomain,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// joinTicketFromRequest reads and validates the ticket cookie.
func (h *Handler) joinTicketFromRequest(r *http.Request) (*token.JoinTicket, error) {
	cookie, err := r.Cookie(joinCookieName)
	if err != nil {
		return nil, err
	}
	return h.tokens.VerifyJoinTicket(cookie.Value)
}

// joinContext tells the registration screen what the ticket already knows, so
// the applicant is not asked to type an address they have just proved.
//
// It answers 401 rather than 403 when the ticket is missing or expired: the
// remedy is to verify the address again, which is a sign-in, not a permission.
func (h *Handler) joinContext(w http.ResponseWriter, r *http.Request) {
	ticket, err := h.joinTicketFromRequest(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	writeJSON(w, map[string]string{
		"email":    ticket.Email,
		"name":     ticket.Name,
		"provider": ticket.Provider,
	})
}

// logJoinTicketIssued records that somebody proved an address and got no account
// for it. Worth a line: before the admission gate this was an enrolment, and the
// absence of one is otherwise invisible.
func logJoinTicketIssued(provider, email string) {
	log.Printf("no account for %s identity (%s); issued a join ticket", provider, email)
}
