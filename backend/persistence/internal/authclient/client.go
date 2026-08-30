// Package authclient asks the auth service who a push audience resolves to.
//
// Persistence cannot import auth's internal/authz — that package is deliberately
// stdlib-only and lives in the auth module (moving it to backend/shared was
// considered and rejected) — so this defines its own copy of the
// wire shape rather than pulling in a module boundary for two field names.
package authclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

// Scope is an audience entry, mirroring authz.Scope's wire shape on the auth
// side: {"kind": "wsko"|"federation"|"branch", "id": "…"}.
type Scope struct {
	Kind string `json:"kind"`
	ID   string `json:"id,omitempty"`
}

// Result is what POST /auth/admin/push-audience answers: either "every
// subscription" (All) or exactly the subscribers of UserIDs.
type Result struct {
	All     bool     `json:"all,omitempty"`
	UserIDs []string `json:"userIds,omitempty"`
}

// ErrUnavailable means the auth service could not be reached at all — a cold
// start or a network blip — as distinct from it validly refusing the request.
var ErrUnavailable = errors.New("auth service unavailable")

// Client resolves a push audience against the auth service, using the
// caller's own access_token cookie so the scope enforced is theirs.
type Client struct {
	baseURL string
	http    *http.Client
}

// New builds a Client. baseURL is the auth service's own origin — persistence
// already has this configured as its expected JWT issuer.
//
// The timeout is generous enough to survive auth waking up from scale-to-zero,
// but stays under persistence's own http.Server.WriteTimeout (30s, main.go) so
// a cold auth service fails the request cleanly rather than having the
// response cut off mid-write. This is a live request, not jwks.Cache's
// background refresh — do not copy that one's 45s verbatim.
func New(baseURL string) *Client {
	return &Client{baseURL: baseURL, http: &http.Client{Timeout: 25 * time.Second}}
}

// ResolveAudience asks auth who the given audience resolves to, authorizing
// every entry against the caller's own roles (forwarded via accessToken). A
// 200 response decodes into Result; any other status is returned unexamined
// for the caller to relay as-is — auth already decided what a failure may say
// (refusals must not leak existence), and persistence has nothing to add to
// that decision.
func (c *Client) ResolveAudience(ctx context.Context, accessToken string, audience []Scope) (*Result, int, error) {
	body, err := json.Marshal(struct {
		Audience []Scope `json:"audience"`
	}{audience})
	if err != nil {
		return nil, 0, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/auth/admin/push-audience", bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "access_token", Value: accessToken})

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, ErrUnavailable
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, nil
	}
	var result Result
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, 0, err
	}
	return &result, http.StatusOK, nil
}
