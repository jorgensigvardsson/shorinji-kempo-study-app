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
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			// If-Match / If-None-Match carry the optimistic-concurrency preconditions
			// on document writes, and neither is CORS-safelisted, so both have to be
			// named here or the browser blocks the request at preflight.
			// The X-App-Schema-* pair carries the writing client's document shape and
			// the highest shape it can hold without dropping anything.
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, If-Match, If-None-Match, X-App-Schema-Version, X-App-Schema-Compat")
			// ETag is likewise not exposed to cross-origin scripts by default, and the
			// client cannot send back a precondition it was never allowed to read.
			w.Header().Set("Access-Control-Expose-Headers", "ETag")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
