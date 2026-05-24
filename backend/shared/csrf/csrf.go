package csrf

import "net/http"

// Middleware rejects unsafe-method requests whose Origin header is present but
// does not match the configured frontend origin. This defends against CSRF on
// cookie-authenticated endpoints: a cross-site attacker cannot craft a fetch or
// XHR that both supplies the auth cookie (blocked by SameSite=Lax on POST/PUT/DELETE)
// and an accepted Origin header.
//
// Safe methods (GET, HEAD, OPTIONS) pass through unconditionally. Requests with
// no Origin header also pass through — they may be same-origin browser requests
// or legitimate non-browser clients.
func Middleware(frontendOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			// safe methods / preflight: no check needed
		default:
			if origin := r.Header.Get("Origin"); origin != "" && origin != frontendOrigin {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
