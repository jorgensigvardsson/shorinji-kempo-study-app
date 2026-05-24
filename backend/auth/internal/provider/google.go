package provider

import (
	"context"
	"fmt"

	gooidc "github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type Google struct {
	config   *oauth2.Config
	verifier *gooidc.IDTokenVerifier
}

func NewGoogle(ctx context.Context, clientID, clientSecret, redirectURI string) (*Google, error) {
	p, err := gooidc.NewProvider(ctx, "https://accounts.google.com")
	if err != nil {
		return nil, fmt.Errorf("discover Google OIDC: %w", err)
	}
	return &Google{
		config: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURI,
			Endpoint:     p.Endpoint(),
			Scopes:       []string{gooidc.ScopeOpenID, "email", "profile"},
		},
		verifier: p.Verifier(&gooidc.Config{ClientID: clientID}),
	}, nil
}

func (g *Google) Name() string { return "google" }

func (g *Google) AuthURL(state, nonce string) string {
	return g.config.AuthCodeURL(state,
		oauth2.AccessTypeOnline,
		gooidc.Nonce(nonce),
	)
}

func (g *Google) Exchange(ctx context.Context, code, nonce string) (*UserInfo, error) {
	oauthToken, err := g.config.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("exchange code: %w", err)
	}
	rawID, ok := oauthToken.Extra("id_token").(string)
	if !ok {
		return nil, fmt.Errorf("missing id_token in token response")
	}
	idToken, err := g.verifier.Verify(ctx, rawID)
	if err != nil {
		return nil, fmt.Errorf("verify id_token: %w", err)
	}
	if idToken.Nonce != nonce {
		return nil, fmt.Errorf("nonce mismatch")
	}
	var claims struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		Name          string `json:"name"`
		EmailVerified bool   `json:"email_verified"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return nil, fmt.Errorf("extract claims: %w", err)
	}
	if !claims.EmailVerified {
		return nil, fmt.Errorf("google: email %q is not verified", claims.Email)
	}
	return &UserInfo{
		Sub:         claims.Sub,
		Email:       claims.Email,
		DisplayName: claims.Name,
	}, nil
}
