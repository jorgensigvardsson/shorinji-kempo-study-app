package api

import (
	"context"
	"crypto/rsa"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/jwks"
)

type contextKey string

const userIDKey contextKey = "userID"

// KeySource resolves a JWT key ID to an RSA public key.
// *jwks.Cache satisfies this interface.
type KeySource interface {
	PublicKey(kid string) (*rsa.PublicKey, error)
}

// authMiddleware validates the access_token cookie as an RS256 JWT and puts the
// sub claim into the request context. Requests without a valid token get 401;
// requests we could not judge because the key source was unreachable get 503.
func authMiddleware(ks KeySource, issuerURL string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("access_token")
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// jwt.Parse folds every failure into a single error, so capture the key
		// lookup's own error to tell an unreachable key source apart from a
		// genuinely bad token.
		var keyErr error
		token, err := jwt.Parse(cookie.Value, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			kid, _ := t.Header["kid"].(string)
			key, err := ks.PublicKey(kid)
			keyErr = err
			return key, err
		}, jwt.WithValidMethods([]string{"RS256"}), jwt.WithIssuer(issuerURL), jwt.WithAudience("shorinji-persistence"), jwt.WithExpirationRequired())

		// The key server was unreachable — typically the auth service still cold
		// -starting from scale-to-zero — so this token's validity is unknown. A
		// 401 here would read as "session expired" and log a legitimate user out;
		// 503 leaves the session intact and invites the client to retry.
		if errors.Is(keyErr, jwks.ErrUnavailable) {
			log.Printf("auth: key source unavailable, refusing to judge token: %v", keyErr)
			w.Header().Set("Retry-After", "5")
			http.Error(w, "key source unavailable", http.StatusServiceUnavailable)
			return
		}

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

// hasRole reports whether a valid access_token cookie carries the given role in
// its "role" claim. Used to gate admin-only actions (e.g. push broadcasts) on a
// signed-in user rather than a shared secret.
func hasRole(ks KeySource, issuerURL string, r *http.Request, role string) bool {
	cookie, err := r.Cookie("access_token")
	if err != nil {
		return false
	}
	var claims jwt.MapClaims
	token, err := jwt.ParseWithClaims(cookie.Value, &claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		kid, _ := t.Header["kid"].(string)
		return ks.PublicKey(kid)
	}, jwt.WithValidMethods([]string{"RS256"}), jwt.WithIssuer(issuerURL), jwt.WithAudience("shorinji-persistence"), jwt.WithExpirationRequired())
	if err != nil || !token.Valid {
		return false
	}
	// The "role" claim is a JSON array of role names; tolerate a bare string too.
	switch v := claims["role"].(type) {
	case []interface{}:
		for _, item := range v {
			if s, ok := item.(string); ok && s == role {
				return true
			}
		}
	case string:
		return v == role
	}
	return false
}
