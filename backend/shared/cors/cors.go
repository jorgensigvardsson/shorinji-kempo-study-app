package cors

import "net/http"

// Middleware adds CORS headers for requests from allowedOrigin and handles
// preflight OPTIONS requests. Only the configured origin is allowed — credentials
// mode requires an explicit origin, not a wildcard.
func Middleware(allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Vary: Origin must be set unconditionally so any CDN/proxy knows the response
		// is origin-dependent and must not serve one origin's cached response to another.
		w.Header().Add("Vary", "Origin")
		if r.Header.Get("Origin") == allowedOrigin {
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
