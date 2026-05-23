package api

import (
	"context"
	"crypto/rsa"
	"fmt"
	"net/http"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const userIDKey contextKey = "userID"

// KeySource resolves a JWT key ID to an RSA public key.
// *jwks.Cache satisfies this interface.
type KeySource interface {
	PublicKey(kid string) (*rsa.PublicKey, error)
}

// authMiddleware validates the access_token cookie as an RS256 JWT and puts the
// sub claim into the request context. Requests without a valid token get 401.
func authMiddleware(ks KeySource, issuerURL string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("access_token")
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		token, err := jwt.Parse(cookie.Value, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			kid, _ := t.Header["kid"].(string)
			return ks.PublicKey(kid)
		}, jwt.WithValidMethods([]string{"RS256"}), jwt.WithIssuer(issuerURL), jwt.WithExpirationRequired())

		if err != nil || !token.Valid {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		sub, err := token.Claims.GetSubject()
		if err != nil || sub == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), userIDKey, sub)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func userIDFromContext(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(userIDKey).(string)
	return id, ok && id != ""
}
