# Security Issues — Backend Introduction Branch

Independent review conducted 2026-05-24. Scope: auth service, persistence API,
shared middleware, frontend sync integration, deployment config.

File-backend findings are excluded; the file backend is not used in production.

---

## High

### H1 — OAuth login state is not bound to the browser session

**Status:** Fixed — fc04132

The auth service stores OAuth `state` in an in-memory server map, but nothing
binds the callback to the browser that initiated the flow. An attacker can
initiate their own OAuth login, obtain a valid callback URL, and trick a victim
into visiting it. The victim's session then receives auth cookies for the
attacker's account.

This is more sensitive here because the frontend reacts to `?auth_success=1`,
switches to backend sync, and may upload the victim's local document to the
attacker's account if it has no document yet.

**Fix:** On `GET /auth/login` and `GET /auth/link`, set a short-lived `HttpOnly`,
`Secure`, `SameSite=Strict` transaction cookie containing a random value (or
HMAC of the state). Store the same value in `pendingState`. On
`GET /auth/callback`, require that the cookie is present and matches, then
delete it.

---

### H2 — Email-domain allowlisting only checked before OAuth, not after

**Status:** Fixed — fc04132

`/auth/login` uses the user-supplied email domain to pick an OIDC provider, but
the callback trusts whatever `info.Email` the provider returns and enrolls that
user unconditionally. A user can start a flow with `someone@allowed.com`,
authenticate as `attacker@gmail.com`, and be enrolled as the attacker identity.

Additional gaps in the callback:
- Google: `email_verified` is not checked; an unverified email is accepted.
- Microsoft: issuer validation is skipped; any tenant under
  `https://login.microsoftonline.com/` is accepted. `preferred_username` is used
  as a fallback email without verified-email guarantees.

**Fix:** Store the requested email or allowed domain in `pendingState`. After
token verification, confirm the returned email matches. For Google, reject tokens
where `email_verified != true`. For Microsoft, validate the `tid` claim against
the expected tenant set (or accept any tenant only if fully open consumer login
is intended).

---

## Medium

### M1 — CSRF protection missing on mutating cookie-authenticated endpoints

**Status:** Fixed — c5374af

State-changing endpoints rely on cookies for auth without explicit CSRF
protection:

- `POST /auth/refresh`, `POST /auth/logout`
- `GET /auth/link` (creates pending server state, redirects to provider)
- `DELETE /auth/link/{provider}`
- `DELETE /auth/account`
- `PUT /api/v1/document`
- `DELETE /api/v1/account`

`SameSite=Lax` blocks cross-site POST/DELETE/PUT from third-party pages, and
the CORS middleware is origin-specific — both are good. However, `SameSite=Lax`
does not block top-level navigations, which matters for `GET /auth/link`.
There is no explicit `Origin`/`Referer` check or CSRF token.

**Fix:** Add middleware that rejects unsafe-method requests whose `Origin` header
is present but does not match the configured frontend origin. Change `/auth/link`
to `POST` before redirecting.

---

### M2 — Refresh token rotation is not atomic, and the secret is stored plaintext

**Status:** Fixed — c5374af

Rotation is find → delete → create. Two concurrent refresh requests can both
read the same old token before either delete completes, resulting in two valid
rotated tokens in the same family. The existing replay-detection revokes the
family on reuse, but a narrow race window still produces two live tokens.

The full refresh token ID (including the random secret bytes) is also stored as
plaintext in Cosmos. A Cosmos data-plane leak or misconfigured export is an
immediate bearer-token leak.

**Fix:** Make rotation atomic — for Cosmos, use a transactional batch or an
ETag-guarded update on a "current token" record per family so only one rotation
can win. Store only an HMAC-SHA-256 (with a server-side pepper) of the random
secret, and verify by recomputing the HMAC on the presented token.

---

### M3 — JWT has no audience claim; JWKS validation is permissive

**Status:** Fixed — c90a555

Access tokens carry `iss`, `sub`, `iat`, `exp`, and `email` but no `aud` claim.
The persistence middleware validates RS256, issuer, and expiration but not
audience. Token confusion becomes a risk as soon as more services consume the
same JWKS.

The JWKS cache (`backend/persistence/internal/jwks/cache.go`) also:
- Does not check whether the HTTP response is 200.
- Accepts any key regardless of `use` or `alg` fields.
- Replaces the key set even if the response contains zero keys.

**Fix:** Add `aud: "shorinji-persistence"` to issued tokens and require it in the
persistence middleware. In the JWKS cache, require HTTP 200, reject empty key
sets, and only accept keys with `kty=RSA`, `use=sig`, `alg=RS256`.

---

### M5 — HTTP servers have no read/write/idle timeouts

**Status:** Fixed — c90a555

Both auth and persistence services create `http.Server` with only `Addr` and
`Handler` set. No `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout`, or
`IdleTimeout` is configured, leaving the services open to slowloris-style
connection exhaustion if the ACA ingress does not fully protect them.

**Fix:**

```go
srv := &http.Server{
    Addr:              *addr,
    Handler:           mux,
    ReadHeaderTimeout: 5 * time.Second,
    ReadTimeout:       15 * time.Second,
    WriteTimeout:      30 * time.Second,
    IdleTimeout:       60 * time.Second,
    MaxHeaderBytes:    1 << 20,
}
```

---

*Last updated: 2026-05-24*
