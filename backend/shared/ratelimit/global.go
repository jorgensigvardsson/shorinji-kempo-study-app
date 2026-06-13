package ratelimit

import (
	"net/http"
	"sync"
	"time"
)

// GlobalRateLimiter enforces a single token-bucket rate limit shared across all
// callers (not per-IP). It exists to cap expensive side effects — e.g. sending
// verification emails, which cost money and burn a finite provider quota — so a
// burst of requests from many IPs still can't exceed the global rate.
//
// It is only correct as a true global limit when the service runs as a single
// replica (as the auth service does); with multiple replicas each would hold its
// own bucket.
type GlobalRateLimiter struct {
	mu       sync.Mutex
	tokens   float64
	lastSeen time.Time
	rate     float64 // tokens replenished per second
	burst    float64 // maximum token accumulation
}

// NewGlobal builds a global limiter. For "1 request every 5 seconds" use
// ratePerSec = 0.2 and burst = 1.
func NewGlobal(ratePerSec, burst float64) *GlobalRateLimiter {
	return &GlobalRateLimiter{tokens: burst, rate: ratePerSec, burst: burst}
}

func (l *GlobalRateLimiter) allow() bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	if !l.lastSeen.IsZero() {
		elapsed := now.Sub(l.lastSeen).Seconds()
		l.tokens += elapsed * l.rate
		if l.tokens > l.burst {
			l.tokens = l.burst
		}
	}
	l.lastSeen = now

	if l.tokens < 1 {
		return false
	}
	l.tokens--
	return true
}

// Middleware wraps a handler and returns 429 when the global limit is exceeded.
func (l *GlobalRateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.allow() {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "5")
			http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
