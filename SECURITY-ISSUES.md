# Security Issues

Findings from a black-hat review of the auth service, persistence service, OIDC flow,
refresh tokens, Cosmos stores, JWKS validation, rate limiting, CORS, Bicep infrastructure,
frontend backend client, and migration tool.

Severity scale: **Critical → High → Medium → Low → Informational**

---

## Critical

### ~~C1 — Logout silently does not revoke the refresh token~~ ✅ Fixed
**Fixed in commit `437a476`**

The refresh cookie was path-scoped to `/auth/refresh`; browsers don't send it on
`POST /auth/logout`. `logout` now reads the user ID from the access token cookie (path `/`)
and calls `refreshTokens.DeleteByUserID(sub)`, revoking all server-side refresh tokens on
sign-out.

---

### ~~C2 — Persistence service does not validate JWT issuer or require `exp`~~ ✅ Fixed
**Fixed in commit `437a476`**

`authMiddleware` now passes `jwt.WithIssuer(issuerURL)` and `jwt.WithExpirationRequired()`.
The expected issuer is configurable via `AUTH_ISSUER_URL` (docker-compose + Bicep wired
through to the persistence container).

---

### ~~C3 — Cookies set without the `Secure` flag~~ ✅ Fixed
**Fixed in commit `437a476`**

`Secure: true` added to both cookies in `setTokenCookies` and `clearTokenCookies`. Browsers
honour `Secure` on `localhost`, so the dev flow is unaffected.

---

## High

### ~~H1 — Refresh token rotation lacks reuse detection~~ ✅ Fixed
**Fixed in commit `2612a26`**

Token family IDs are now embedded in the token format (`{userID}.{familyID}.{secret}`).
On rotation the family ID is inherited; on a fresh login a new family ID is generated via
`NewFamilyID()`. If a deleted token is presented and its family still has an active member,
all tokens for that user are immediately revoked (OAuth 2.1 BCP §4.13.2).

---

### ~~H2 — Rate limiter trusts client-supplied `X-Forwarded-For` (leftmost value)~~ ✅ Fixed
**Fixed in commit `2612a26`**

`clientIP` now uses the rightmost XFF value — the IP appended by ACA's ingress — instead
of the leftmost value supplied by the client.

---

### ~~H3 — `crypto/rand.Read` errors silently ignored~~ ✅ Fixed
**Fixed in commit `437a476`**

`randomString` now returns `(string, error)`; `NewRefreshToken` returns `(*RefreshToken, error)`.
All call sites propagate errors and return 500.

---

### ~~H4 — No request body size limit on `PUT /api/v1/document`~~ ✅ Fixed
**Fixed in commit `437a476`**

`putDocument` now wraps the body with `http.MaxBytesReader(w, r.Body, 1<<20)`. Payloads over
1 MB get a 413 before the JSON decoder runs. This also resolves L5.

---

## Medium

### M1 — JWKS fetch has no HTTP timeout and no body size limit
**File**: `backend/persistence/internal/jwks/cache.go` — `Refresh`

`http.Get(c.url)` uses the default client (no timeout). A hanging auth service stalls the
refresh goroutine indefinitely. No size limit on the response body.

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

### ~~L5 — No per-document size enforcement at the store layer~~ ✅ Fixed
**Fixed as part of H4 in commit `437a476`**

The 1 MB `MaxBytesReader` cap on `PUT /api/v1/document` now enforces a limit well below
Cosmos's 2 MB hard cap.

---

## Informational — Already Handled Well

- Bicep secret handling: `@secure()` parameters routed through `secrets:` + `secretRef:`.
- Refresh cookie is `HttpOnly` and `Secure`; access cookie is `HttpOnly`, `Secure`, path `/`.
- Both cookies use `SameSite=Lax` — correct for OIDC redirect flows.
- `identity_index` uses SHA-256(provider:sub): no Cosmos ID injection via OIDC `sub` values.
- Refresh token format encodes user ID: no cross-partition queries needed, and the random
  suffix is the actual secret.
- Continuous backup + free-tier RU/s cap in Cosmos Bicep.
- Docker images: UID 65534, scratch base, no shell, no package manager.
- `cosmos.outputs.primaryKey` removed from module output (plaintext deployment-history fix).

---

## Open Issues — Fix Priority

| # | Finding | Effort |
|---|---------|--------|
| ~~1~~ | ~~H1 — refresh token reuse detection~~ | ✅ Fixed |
| ~~2~~ | ~~H2 — rate limiter trusts leftmost XFF~~ | ✅ Fixed |
| 3 | M1 — JWKS fetch: no timeout, no size limit | Small |
| 4 | M2 — no security response headers | Small |
| 5 | M3 — migration tool: Cosmos key via CLI flag | Small |
| 6 | M4 — identity link: no email ownership check | Medium |
| 7 | M5 — OIDC state in-process only (multi-replica) | Medium |
| 8 | M6 — missing `Vary: Origin` on CORS responses | Trivial |
| 9 | L1 — `Verify` missing `WithValidMethods` | Trivial |
| 10 | L2 — domain enumeration via `/auth/resolve` | Accept or Low-effort fix |
| 11 | L3 — identity-index race on concurrent link/unlink | Medium |
| 12 | L4 — `isConnected()` reads localStorage only | Low |
