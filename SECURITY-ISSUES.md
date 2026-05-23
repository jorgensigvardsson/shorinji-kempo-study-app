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

### ~~M1 — JWKS fetch has no HTTP timeout and no body size limit~~ ✅ Fixed
**Fixed in commit `TBD_M`**

`jwksHTTPClient` (10 s timeout) replaces the default client. The response body is wrapped with
`io.LimitReader(resp.Body, 64*1024)` before decoding, capping the read at 64 KB.

---

### ~~M2 — No security response headers on either service~~ ✅ Fixed
**Fixed in commit `TBD_M`**

New `backend/shared/secureheaders` middleware added. Both services wrap their root handler with
`secureheaders.Middleware`, which sets `Strict-Transport-Security`, `X-Content-Type-Options`,
`Referrer-Policy`, and `Cache-Control: no-store` on every response.

---

### ~~M3 — Migration tool accepts the Cosmos key as a CLI flag~~ ✅ Fixed
**Fixed in commit `TBD_M`**

The migration tool (`tools/migrate/`) is no longer needed and has been deleted entirely,
eliminating the credential-exposure risk at the root.

---

### ~~M4 — Identity link flow does not verify email ownership~~ ✅ Fixed
**Fixed in commit `TBD_M`**

`callback` (link branch) now calls `strings.EqualFold(info.Email, target.Email)` before
persisting the new identity. An email mismatch redirects to `?link_error=email_mismatch`
without modifying the user record.

---

### ~~M5 — Pending OIDC state is in-process only — breaks across replicas~~ ✅ Fixed
**Fixed in commit `TBD_M`**

`auth-app.bicep` now sets `maxReplicas: 1`. The auth service is intentionally single-replica:
it holds in-process OIDC pending state and an in-memory signing key, neither of which is safe
to shard across replicas without a distributed backing store.

---

### ~~M6 — Missing `Vary: Origin` header on CORS responses~~ ✅ Fixed
**Fixed in commit `TBD_M`**

`w.Header().Add("Vary", "Origin")` is now set unconditionally in the CORS middleware, before
the origin check, so every response — including non-CORS ones — carries the header.

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
| ~~3~~ | ~~M1 — JWKS fetch: no timeout, no size limit~~ | ✅ Fixed |
| ~~4~~ | ~~M2 — no security response headers~~ | ✅ Fixed |
| ~~5~~ | ~~M3 — migration tool: Cosmos key via CLI flag~~ | ✅ Fixed |
| ~~6~~ | ~~M4 — identity link: no email ownership check~~ | ✅ Fixed |
| ~~7~~ | ~~M5 — OIDC state in-process only (multi-replica)~~ | ✅ Fixed |
| ~~8~~ | ~~M6 — missing `Vary: Origin` on CORS responses~~ | ✅ Fixed |
| 9 | L1 — `Verify` missing `WithValidMethods` | Trivial |
| 10 | L2 — domain enumeration via `/auth/resolve` | Accept or Low-effort fix |
| 11 | L3 — identity-index race on concurrent link/unlink | Medium |
| 12 | L4 — `isConnected()` reads localStorage only | Low |
