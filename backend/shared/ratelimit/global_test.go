package ratelimit

import "testing"

func TestGlobalRateLimiter_OncePerWindow(t *testing.T) {
	// 1 request every 5 seconds (rate 0.2/s, burst 1).
	l := NewGlobal(0.2, 1)

	if !l.allow() {
		t.Fatal("first request should be allowed")
	}
	if l.allow() {
		t.Fatal("second immediate request should be rejected")
	}
}

func TestGlobalRateLimiter_RefillsOverTime(t *testing.T) {
	l := NewGlobal(0.2, 1)
	if !l.allow() {
		t.Fatal("first request should be allowed")
	}
	// Simulate ~6 seconds elapsing by rewinding lastSeen; tokens should refill to >=1.
	l.lastSeen = l.lastSeen.Add(-6_000_000_000) // 6s in nanoseconds
	if !l.allow() {
		t.Fatal("request after the window should be allowed again")
	}
}
