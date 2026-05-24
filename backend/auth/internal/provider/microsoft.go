package provider

import (
	"context"
	"fmt"
	"strings"

	gooidc "github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type Microsoft struct {
	config   *oauth2.Config
	verifier *gooidc.IDTokenVerifier
}

// NewMicrosoft creates a Microsoft OIDC provider using the common (multi-tenant) endpoint.
// The common endpoint returns a {tenantid} placeholder in the issuer claim, so standard
// issuer validation is skipped and replaced by a prefix check against microsoftonline.com.
func NewMicrosoft(ctx context.Context, clientID, clientSecret, redirectURI string) (*Microsoft, error) {
	ctx = gooidc.InsecureIssuerURLContext(ctx, "https://login.microsoftonline.com/common/v2.0")
	p, err := gooidc.NewProvider(ctx, "https://login.microsoftonline.com/common/v2.0")
	if err != nil {
		return nil, fmt.Errorf("discover Microsoft OIDC: %w", err)
	}
	return &Microsoft{
		config: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURI,
			Endpoint:     p.Endpoint(),
			Scopes:       []string{gooidc.ScopeOpenID, "email", "profile"},
		},
		verifier: p.Verifier(&gooidc.Config{
			ClientID:        clientID,
			SkipIssuerCheck: true, // issuer varies per tenant; validated manually below
		}),
	}, nil
}

func (m *Microsoft) Name() string { return "microsoft" }

func (m *Microsoft) AuthURL(state, nonce string) string {
	return m.config.AuthCodeURL(state,
		oauth2.AccessTypeOnline,
		gooidc.Nonce(nonce),
	)
}

func (m *Microsoft) Exchange(ctx context.Context, code, nonce string) (*UserInfo, error) {
	oauthToken, err := m.config.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("exchange code: %w", err)
	}
	rawID, ok := oauthToken.Extra("id_token").(string)
	if !ok {
		return nil, fmt.Errorf("missing id_token in token response")
	}
	idToken, err := m.verifier.Verify(ctx, rawID)
	if err != nil {
		return nil, fmt.Errorf("verify id_token: %w", err)
	}
	if !strings.HasPrefix(idToken.Issuer, "https://login.microsoftonline.com/") {
		return nil, fmt.Errorf("unexpected issuer: %s", idToken.Issuer)
	}
	if idToken.Nonce != nonce {
		return nil, fmt.Errorf("nonce mismatch")
	}
	var claims struct {
		Sub               string `json:"sub"`
		Email             string `json:"email"`
		PreferredUsername string `json:"preferred_username"`
		Name              string `json:"name"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return nil, fmt.Errorf("extract claims: %w", err)
	}
	// Microsoft sometimes omits 'email'; fall back to preferred_username (which is usually
	// the email address for consumer accounts).
	email := claims.Email
	if email == "" {
		email = claims.PreferredUsername
	}
	return &UserInfo{
		Sub:         claims.Sub,
		Email:       email,
		DisplayName: claims.Name,
	}, nil
}
