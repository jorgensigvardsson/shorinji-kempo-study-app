# Security Issues

Findings from a black-hat review of the auth service, persistence service, OIDC flow,
refresh tokens, Cosmos stores, JWKS validation, rate limiting, CORS, Bicep infrastructure,
frontend backend client, and migration tool.

Severity scale: **Critical → High → Medium → Low → Informational**

---

## Critical

### C1 — Logout silently does not revoke the refresh token
**Files**: `backend/auth/internal/api/handlers.go` — `logout` (line ~350), `setTokenCookies` (line ~378)

The refresh cookie is set with `Path: "/auth/refresh"`. Browsers therefore don't send it on
`POST /auth/logout`, so `r.Cookie(refreshCookieName)` returns `ErrNoCookie`, the deletion is
skipped, and the server-side token persists for up to 30 days.

**Impact**: a stolen refresh token survives the user clicking "Sign out".

**Fix**: read the user ID from the access cookie (path "/") inside `logout` and call
`refreshTokens.DeleteByUserID(sub)`, or broaden the refresh cookie path to `/auth/` and place
both endpoints under that prefix.

---

### C2 — Persistence service does not validate JWT issuer or require `exp`
**File**: `backend/persistence/internal/api/middleware.go` — `authMiddleware`

`jwt.Parse` is called with only `jwt.WithValidMethods([]string{"RS256"})`. No
`jwt.WithIssuer(...)` and no `jwt.WithExpirationRequired()`. The middleware accepts any RS256
token signed by any key in its JWKS cache, regardless of issuer; tokens missing `exp` are also
accepted.

**Impact**: if the JWKS endpoint is ever misconfigured or DNS-hijacked, arbitrary tokens become
valid.

**Fix**: add `jwt.WithIssuer(expectedIssuer)` (env-configurable, matching `SERVICE_ISSUER` on
the auth side) and `jwt.WithExpirationRequired()`.

---

### C3 — Cookies set without the `Secure` flag
**File**: `backend/auth/internal/api/handlers.go` — `setTokenCookies`, `clearTokenCookies`

Neither function sets `Secure: true`. In any HTTP scenario (mixed-content downgrade,
staging URL, dev misconfiguration), access and refresh tokens are transmitted in cleartext.

**Fix**: `Secure: true` unconditionally in production. Gate behind an env flag if the dev
environment uses `http://localhost`.

---

## High

### H1 — Refresh token rotation lacks reuse detection
**File**: `backend/auth/internal/api/handlers.go` — `refresh`

Rotation is implemented (old token deleted, new one issued), but there is no detection of a
previously-used token being presented again. A stolen refresh token lets an attacker keep
rotating indefinitely in parallel with the legitimate user.

**Fix**: per OAuth 2.1 BCP §4.13.2, when a refresh token from a known-deleted "family" is
presented, revoke all refresh tokens for that user. Requires storing a family ID that persists
across rotations.

---

### H2 — Rate limiter trusts client-supplied `X-Forwarded-For` (leftmost value)
**File**: `backend/shared/ratelimit/ratelimit.go` — `clientIP`

The leftmost XFF value is used as the client IP. ACA's ingress appends to whatever the client
sent; an attacker sends a different IP on every request, bypassing per-IP limits entirely.

**Fix**: trust the rightmost IP — the one appended by the known trusted proxy, not the one
supplied by the client.

---

### H3 — `crypto/rand.Read` errors silently ignored
**Files**:
- `backend/auth/internal/api/handlers.go` — `randomString` (OIDC state + nonce)
- `backend/auth/internal/store/refresh.go` — `NewRefreshToken`

If `rand.Read` fails, these functions return a string of zeros. Predictable state/nonce defeats
OIDC CSRF protection; a predictable refresh token suffix exposes all tokens for any user whose
ID is known.

**Fix**: panic or propagate the error — both call sites have existing error-return paths.

---

### H4 — No request body size limit on `PUT /api/v1/document`
**File**: `backend/persistence/internal/api/handlers.go` — `putDocument`

`json.NewDecoder(r.Body).Decode(&doc)` reads until EOF. An authenticated attacker can stream
gigabytes; the service OOMs before Cosmos's 2 MB item limit has any effect.

**Fix**: `http.MaxBytesReader(w, r.Body, 1<<20)` (or a config-appropriate ceiling) before
decoding.

---

## Medium

### M1 — JWKS fetch has no HTTP timeout and no body size limit
**File**: `backend/persistence/internal/jwks/cache.go` — `Refresh`

`http.Get(c.url)` uses the default client (no timeout). A hanging auth service stalls the
refresh goroutine indefinitely. No `MaxBytesReader` on the response body.

**Fix**: dedicated `*http.Client` with (e.g.) a 10 s timeout; wrap body with
`http.MaxBytesReader`.

---

### M2 — No security response headers on either service
No `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, or
`Cache-Control: no-store` on auth responses. The callback and `/auth/me` responses issue or
echo tokens via Set-Cookie and JSON respectively.

**Fix**: small middleware adding these headers globally; `Cache-Control: no-store` is
non-negotiable on the callback and auth endpoints.

---

### M3 — Migration tool accepts the Cosmos key as a CLI flag
**File**: `tools/migrate/main.go` — `--cosmos-key`

A CLI flag exposes the primary key in process listings (`ps aux`) and shell history. The Cosmos
primary key grants full account access.

**Fix**: support env-var or stdin input; keep the flag as an undocumented fallback with a
deprecation warning.

---

### M4 — Identity link flow does not verify email ownership
**File**: `backend/auth/internal/api/handlers.go` — `callback` (link branch)

The flow only checks the target identity isn't already linked elsewhere. It does not require the
incoming OIDC email to match the existing user's email. A user with a compromised session can
permanently bind a foreign identity to their account.

**Fix**: require email match (case-insensitive) between the OIDC response and the existing
user's primary email, or add an explicit confirmation step in the UI before persisting.

---

### M5 — Pending OIDC state is in-process only — breaks across replicas
**File**: `backend/auth/internal/api/handlers.go` — `Handler.pending`

The `pending` map is per-process. ACA's `maxReplicas: 3` means the callback can land on a
different replica than the login initiation, silently breaking the OIDC flow. Not exploitable
on its own but the resulting error noise hides real attacks.

**Fix**: pin `maxReplicas: 1`, enable ACA sticky sessions, or persist state to Cosmos with a
10-minute TTL.

---

### M6 — Missing `Vary: Origin` header on CORS responses
**File**: `backend/shared/cors/cors.go`

If any CDN or proxy ever sits in front of the auth service, a cached response for the allowed
origin can be served to other origins. One-line fix.

**Fix**: `w.Header().Add("Vary", "Origin")` in the CORS middleware.

---

## Low

### L1 — `Manager.Verify` does not use `WithValidMethods`
**File**: `backend/auth/internal/token/jwt.go` — `Verify`

The method type check (`*jwt.SigningMethodRSA`) catches `alg: none` but allows RS384/RS512.
`jwt.WithValidMethods([]string{"RS256"})` is the documented hardening. The persistence
middleware already does this correctly.

---

### L2 — `/auth/resolve` enables email-domain enumeration
**File**: `backend/auth/internal/api/handlers.go` — `resolve`

Returns whether a given email domain has a configured OIDC provider. Information disclosure;
not directly exploitable.

---

### L3 — Race on identity-index sync during concurrent link/unlink
**File**: `backend/auth/internal/store/cosmos.go` — `Save`

The load-mutate-save loop has no ETag/optimistic-concurrency guard. Two concurrent operations
can leave the index inconsistent with the user record. Self-inflicted worst case: a linked
provider cannot log in until the next successful Save.

---

### L4 — Frontend `isConnected()` reads localStorage only
**File**: `frontend/src/sync/backend.ts` — `isConnected`

The UI can show "connected" after the cookie has expired. Server is the source of truth on
every real request; this is a confusing-state issue, not an exploit.

---

### L5 — No per-document size enforcement at the store layer
Cosmos enforces a 2 MB item limit server-side; there is no earlier enforcement in the
persistence service code. Combined with H4, Cosmos is the only backstop.

---

## Informational — Already Handled Well

- Bicep secret handling: `@secure()` parameters routed through `secrets:` + `secretRef:`.
- Refresh cookie is `HttpOnly`; access cookie is `HttpOnly` with path `/`.
- Both cookies use `SameSite=Lax` — correct for OIDC redirect flows.
- `identity_index` uses SHA-256(provider:sub): no Cosmos ID injection via OIDC `sub` values.
- Refresh token format encodes user ID: no cross-partition queries needed, and the random
  suffix is the actual secret.
- Continuous backup + free-tier RU/s cap in Cosmos Bicep.
- Docker images: UID 65534, scratch base, no shell, no package manager.
- `cosmos.outputs.primaryKey` removed from module output (plaintext deployment-history fix).

---

## Fix Priority

| # | Finding | Effort |
|---|---------|--------|
| 1 | C1 — logout doesn't revoke refresh token | Small |
| 2 | C2 — persistence missing issuer + exp validation | Small |
| 3 | C3 — cookies missing `Secure` flag | Trivial |
| 4 | H3 — rand.Read errors silently ignored | Trivial |
| 5 | H4 — no body size limit on PUT /api/v1/document | Trivial |
| 6 | H2 — rate limiter trusts leftmost XFF | Small |
| 7 | H1 — refresh token reuse detection | Medium |
| 8 | M1–M6 | Small–Medium each |
