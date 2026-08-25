package token

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// JoinTicketTTL is how long somebody has to choose a branch after proving they
// control an address. Long enough to read a page and pick from a list, short
// enough that a ticket left in a browser is not a standing invitation.
const JoinTicketTTL = 15 * time.Minute

// JoinTicket is proof that somebody controls an email address, and nothing else.
// It is emphatically not a session: it names no user, because at the point it is
// minted there is no user, and the whole purpose of the admission gate is that
// controlling an address is not by itself grounds for an account.
//
// It carries the provider identity so that approving the request later can link
// the account to the same identity that proved the address, rather than trusting
// whatever the applicant types next.
type JoinTicket struct {
	Provider string // "google" | "microsoft" | "email"
	Sub      string // the provider's subject, or the address itself for email codes
	Email    string
	Name     string // display name as the provider gave it; empty for email codes
}

type joinClaims struct {
	jwt.RegisteredClaims
	Provider string `json:"provider"`
	Sub      string `json:"psub"` // not "sub": that is the registered claim, and this is not a user id
	Email    string `json:"email"`
	Name     string `json:"name,omitempty"`
}

// IssueJoinTicket mints a short-lived ticket for a verified address.
func (m *Manager) IssueJoinTicket(ticket JoinTicket) (string, error) {
	if ticket.Email == "" || ticket.Provider == "" || ticket.Sub == "" {
		return "", fmt.Errorf("join ticket needs a provider, a subject and an address")
	}
	now := time.Now()
	claims := joinClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    m.issuer,
			Audience:  jwt.ClaimStrings{JoinAudience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(JoinTicketTTL)),
		},
		Provider: ticket.Provider,
		Sub:      ticket.Sub,
		Email:    ticket.Email,
		Name:     ticket.Name,
	}
	t := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	t.Header["kid"] = m.kid
	return t.SignedString(m.privateKey)
}

// VerifyJoinTicket parses and validates a join ticket. The audience is required,
// so an access token presented here is rejected however valid it is in its own
// right — the two kinds are signed by the same key and must not be confusable.
func (m *Manager) VerifyJoinTicket(tokenStr string) (*JoinTicket, error) {
	t, err := jwt.ParseWithClaims(tokenStr, &joinClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return &m.privateKey.PublicKey, nil
	}, jwt.WithValidMethods([]string{"RS256"}), jwt.WithIssuer(m.issuer),
		jwt.WithAudience(JoinAudience), jwt.WithExpirationRequired())
	if err != nil {
		return nil, err
	}
	claims, ok := t.Claims.(*joinClaims)
	if !ok {
		return nil, fmt.Errorf("invalid claims type")
	}
	if claims.Email == "" || claims.Provider == "" || claims.Sub == "" {
		return nil, fmt.Errorf("join ticket is missing an identity")
	}
	return &JoinTicket{
		Provider: claims.Provider,
		Sub:      claims.Sub,
		Email:    claims.Email,
		Name:     claims.Name,
	}, nil
}
