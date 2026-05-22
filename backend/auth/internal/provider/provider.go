package provider

import "context"

type UserInfo struct {
	Sub         string
	Email       string
	DisplayName string
}

type Provider interface {
	Name() string
	AuthURL(state, nonce string) string
	Exchange(ctx context.Context, code, nonce string) (*UserInfo, error)
}
