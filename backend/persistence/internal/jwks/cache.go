package jwks

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"sync"
	"time"
)

var jwksHTTPClient = &http.Client{Timeout: 10 * time.Second}

// Cache fetches RSA public keys from a JWKS endpoint and caches them by key ID.
// On unknown key ID it retries once (handles key rotation); otherwise it refreshes hourly.
type Cache struct {
	url  string
	mu   sync.RWMutex
	keys map[string]*rsa.PublicKey
}

func NewCache(url string) *Cache {
	return &Cache{url: url}
}

// Start fetches the initial keyset and begins the background refresh loop.
//
// A failed initial fetch is logged, not fatal. PublicKey refreshes on a cache
// miss, so the service recovers by itself on the first token validation once
// the JWKS endpoint is reachable. Failing hard here would turn a transient
// dependency blip — an auth service still cold-starting from scale-to-zero —
// into a permanent outage that only a manual revision restart clears.
func (c *Cache) Start(ctx context.Context) {
	if err := c.Refresh(); err != nil {
		log.Printf("jwks: initial fetch from %s failed: %v — starting without keys, retrying in the background", c.url, err)
	}
	go c.refreshLoop(ctx)
}

// refreshLoop retries rapidly (with backoff) until the cache holds keys, then
// settles into an hourly refresh. Keys are only replaced on a successful fetch,
// so a later failure leaves the existing keyset serving.
func (c *Cache) refreshLoop(ctx context.Context) {
	const (
		initialBackoff = 2 * time.Second
		maxInterval    = 1 * time.Hour
	)
	backoff := initialBackoff

	for {
		interval := maxInterval
		if !c.hasKeys() {
			interval = backoff
			if backoff *= 2; backoff > maxInterval {
				backoff = maxInterval
			}
		}

		select {
		case <-time.After(interval):
			if err := c.Refresh(); err != nil {
				log.Printf("jwks: refresh failed: %v", err)
			} else {
				backoff = initialBackoff
			}
		case <-ctx.Done():
			return
		}
	}
}

func (c *Cache) hasKeys() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.keys) > 0
}

// PublicKey returns the RSA public key for kid.
// On a cache miss it attempts one refresh before returning an error.
func (c *Cache) PublicKey(kid string) (*rsa.PublicKey, error) {
	if key := c.lookup(kid); key != nil {
		return key, nil
	}
	// Unknown kid — might be a freshly rotated key; try once more.
	if err := c.Refresh(); err != nil {
		return nil, err
	}
	if key := c.lookup(kid); key != nil {
		return key, nil
	}
	return nil, fmt.Errorf("jwks: unknown key id %q", kid)
}

func (c *Cache) lookup(kid string) *rsa.PublicKey {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.keys[kid]
}

// Refresh fetches the JWKS from the configured URL and replaces the in-memory keyset.
func (c *Cache) Refresh() error {
	resp, err := jwksHTTPClient.Get(c.url)
	if err != nil {
		return fmt.Errorf("jwks: fetch %s: %w", c.url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("jwks: unexpected status %d from %s", resp.StatusCode, c.url)
	}

	var raw struct {
		Keys []struct {
			Kty string `json:"kty"`
			Use string `json:"use"`
			Alg string `json:"alg"`
			Kid string `json:"kid"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	// 64 KB is well above any real JWKS; cap prevents a slow/large response from
	// stalling the refresh goroutine indefinitely.
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64*1024)).Decode(&raw); err != nil {
		return fmt.Errorf("jwks: parse response: %w", err)
	}

	keys := make(map[string]*rsa.PublicKey, len(raw.Keys))
	for _, k := range raw.Keys {
		if k.Kty != "RSA" || k.Use != "sig" || k.Alg != "RS256" || k.Kid == "" {
			continue
		}
		key, err := parseRSAPublicKey(k.N, k.E)
		if err != nil {
			return fmt.Errorf("jwks: parse key %q: %w", k.Kid, err)
		}
		keys[k.Kid] = key
	}

	if len(keys) == 0 {
		return fmt.Errorf("jwks: response contained no usable RSA RS256 sig keys")
	}

	c.mu.Lock()
	c.keys = keys
	c.mu.Unlock()

	log.Printf("jwks: loaded %d key(s)", len(keys))
	return nil
}

func parseRSAPublicKey(nB64, eB64 string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(nB64)
	if err != nil {
		return nil, fmt.Errorf("decode N: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(eB64)
	if err != nil {
		return nil, fmt.Errorf("decode E: %w", err)
	}
	e := 0
	for _, b := range eBytes {
		e = e<<8 | int(b)
	}
	return &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: e}, nil
}
