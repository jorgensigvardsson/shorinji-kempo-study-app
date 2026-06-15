# Shorinji Kempo App — Backend Architecture

The app is client-first: user data lives locally and syncs to OneDrive, Google Drive, or our
own backend. Backend identity is **opt-in** — the anonymous / OneDrive / Google Drive flows
work without any backend interaction.

The backend consists of two Go services plus shared packages:

| Service | Purpose |
|---------|---------|
| `backend/auth` | OIDC federated login, user enrollment, JWT issuance, account linking, account deletion |
| `backend/persistence` | Per-user app data storage, account data deletion, web push notifications |
| `backend/shared` | Cross-cutting middleware: `ratelimit`, `cors`, `csrf`, `secureheaders`, `envutil` |

Every endpoint in both services is wrapped in the same middleware chain:
`secureheaders → cors → csrf → ratelimit` (see `RegisterRoutes` in each service's
`internal/api/handlers.go`). Rate limiting via `backend/shared/ratelimit` (`IPRateLimiter`)
is a hard requirement on every endpoint.

---

## Services

### `backend/auth` — Identity & Token Service

**Responsibilities:**
- Initiate OIDC flows and handle provider callbacks
- Validate ID tokens (signature, issuer, audience, expiry, nonce)
- Enroll new users (first login → create user record)
- Issue signed JWTs (1 h access token + 30-day refresh token, rotated on use)
- Serve public keys at `/.well-known/jwks.json` so other services can verify tokens
  offline without calling back to the auth service
- Refresh and revoke tokens; handle logout
- Delete the user record and refresh tokens on account deletion
- Stamp user roles (from the role store) into the access token

**Does NOT:** store app data or know about grades, notes, hokei, etc.

**Providers configured:** Google (`gmail.com`, `googlemail.com`) and Microsoft
(`outlook.com`, `hotmail.com`, `live.com`, `msn.com`). Microsoft uses the `common`
multi-tenant endpoint; the issuer check is replaced by a prefix assertion against
`https://login.microsoftonline.com/`. Provider selection is driven entirely by the email
domain the user types — no provider picker is shown.

### `backend/persistence` — Data Persistence Service

**Responsibilities:**
- Store and retrieve one `AppDataDocument` per authenticated user
- Validate JWTs by verifying their signature against the auth service's published JWKS
- Use the JWT `sub` claim (our internal UUID) as the storage key
- Delete the user's document on account deletion
- Web push: store subscriptions, hand out the VAPID public key, broadcast notifications

**Does NOT:** know about OIDC or issue tokens.

---

## OIDC Auth Flow

1. User picks "Sign in" and types their email address
2. Frontend sends the email to `GET /auth/login?email=foo@company.com`
3. Auth service extracts the domain, looks it up in the provider config, and initiates the
   OIDC flow for that provider (state + nonce generated server-side; pending state is held
   in-process, which is why the auth service runs as a single replica)
4. Provider authenticates the user and redirects back to `GET /auth/callback`
5. Auth service validates state + nonce, exchanges the code for tokens, validates the ID token
6. Auth service looks up the user by `(provider, sub)` in `linkedIdentities`:
   - **Existing user:** update `lastLoginAt`
   - **New user:** generate a UUID, create a user record with this provider linked
7. Auth service issues a signed JWT (`sub` = our UUID), delivers it as an httpOnly cookie,
   and redirects to the frontend
8. Frontend detects successful login and switches the sync provider to `"backend"`
9. On JWT expiry the frontend silently refreshes via the refresh token before surfacing
   `AuthExpiredError`

```
Browser          Frontend App      Auth Service      OIDC Provider     Database
   |                  |                 |                  |               |
   | Open app         |                 |                  |               |
   |----------------->|                 |                  |               |
   |          (no cookie - anonymous or prompt)            |               |
   | Click "Sign in"  |                 |                  |               |
   |----------------->|                 |                  |               |
   | User types email address           |                  |               |
   |<-----------------|                 |                  |               |
   | GET /auth/login?email=foo@co.com   |                  |               |
   |-------------------------------------------------->    |               |
   |                               Extract domain          |               |
   |                               Look up provider cfg    |               |
   |                               Build OIDC URL          |               |
   |                               + state + nonce         |               |
   | Redirect to provider                                  |               |
   |<--------------------------------------------------|                   |
   | Authenticate with provider                                            |
   |---------------------------------------------------------------->|     |
   | Redirect to /auth/callback?code=...&state=...                        |
   |<----------------------------------------------------------------|     |
   |-------------------------------------------------->|                   |
   |                               Validate state+nonce                    |
   |                               Exchange code for tokens                |
   |                               Validate ID token                       |
   |                               FindByLinkedIdentity(provider, sub)     |
   |                               ---------------------------------->|    |
   |                               <----------------------------------|    |
   |                               Enroll if new (gen UUID) ---------->|   |
   |                               Issue JWT (sub=UUID)                    |
   | Redirect to frontend, set httpOnly cookies         |               |
   |<--------------------------------------------------|                   |
   | App resumes; sync provider = "backend"            |               |
```

### Account linking
An authenticated user can link additional providers: `POST /auth/link?email=...` initiates a
second OIDC flow; the callback adds the identity to the existing account. Uniqueness is
enforced — an identity already linked to any account is rejected. `DELETE /auth/link/{provider}`
unlinks one identity and returns 409 if it would be the last one.

### Email (verification code) login
For email domains **without** a configured OIDC provider, users sign in with a one-time code:

1. `POST /auth/email/start` `{email, language}`. If the domain actually has an OIDC provider it
   returns `{action:"oidc", provider}` (no email sent). Otherwise it emails a 6-digit code and
   returns `{action:"existing"}` or `{action:"new"}` (whether the address is already a user).
2. `POST /auth/email/verify` `{email, code, name}`. On a valid code it looks up or creates the
   user (storing `name` as `DisplayName` only on creation) and issues the session cookies.

Codes are held **in memory** (single replica, like OIDC pending state): SHA-256 hashed, 10-min
TTL, max 5 attempts, one active code per address (resend overwrites), swept periodically. The
linked-identity provider key is `"email"` with `sub` = the lowercased address. `/auth/email/start`
carries a **global** 1-req-per-5s limiter on top of the per-IP limit to protect the email quota.

Email is sent via **Azure Communication Services** (`internal/email`). There is no Go data-plane
SDK for ACS Email, so the client issues the REST POST directly, authenticated by the auth service's
**user-assigned managed identity** (Entra ID) — it acquires a bearer token for
`https://communication.azure.com/.default` via `azidentity` and sends `Authorization: Bearer`.
**No access key is ever stored.** When `ACS_ENDPOINT`/`ACS_SENDER_ADDRESS`/`ACS_IDENTITY_CLIENT_ID`
are unset (local dev), codes are logged to stdout instead. Start on the free Azure-managed sender
domain (5/min, 10/hour subscription cap); switch to a verified custom domain later by linking it +
DNS and changing only `ACS_SENDER_ADDRESS`.

The ACS resource and its managed email domain are provisioned **out-of-band** (the managed domain's
`donotreply@<guid>.azurecomm.net` sender is only known after creation). The deploy pipeline feeds
`ACS_ENDPOINT` and `ACS_SENDER_ADDRESS` as bicep parameters (GitHub repo *variables*, not secrets).
Bicep creates a user-assigned managed identity per backend service, attaches each to its container
app, and grants **only** the auth identity the **Communication and Email Service Owner** role
(`09976791-48a7-449e-bb21-39d1a415f350`) on the ACS resource (the resource name is derived from the
endpoint's first DNS label). Persistence gets its own identity but no ACS access. For the pipeline
to create that role assignment, the GitHub deploy service principal needs **Role Based Access
Control Administrator** on the resource group (scoped, excluding privileged roles).

---

## Data Models

### User Record (`users` container)
```json
{
  "id":          "550e8400-e29b-41d4-a716-446655440000",
  "email":       "jane@example.com",
  "displayName": "Jane Doe",
  "linkedIdentities": {
    "google":    { "sub": "1234567890", "email": "jane@gmail.com" },
    "microsoft": { "sub": "abcdef1234", "email": "jane@company.com" }
  },
  "createdAt":   "2026-05-22T18:00:00Z",
  "lastLoginAt": "2026-05-22T18:00:00Z"
}
```
- `id` is a server-generated UUID — stable regardless of which provider the user logs in with
- `linkedIdentities` maps provider name → `{sub, email}` for each linked provider
- Provider lookup happens only at login; the UUID is used for everything else.
  In Cosmos a dedicated `identity_index` container gives O(1) `FindByLinkedIdentity`
  lookups without cross-partition queries

### Role Record (`roles` container)
```json
{ "id": "jane@example.com", "roles": ["admin"] }
```
Keyed by lowercased email. Roles are managed **out-of-band** (an operator adds an item
directly to the store); the auth service only reads them at token issuance and stamps them
into the access token as the `role` claim. The `admin` role currently authorizes push
broadcasts from the web UI.

### App Data Document (`documents` container)
```json
{
  "id":        "<user UUID>",
  "userId":    "<user UUID>",
  "version":   1,
  "updatedAt": "2026-05-22T18:00:00Z",
  "deviceId":  "...",
  "data":      { }
}
```
One document per user. The `data` field is opaque to the persistence service.

### JWT Access Token Claims
```json
{
  "iss":   "<auth service issuer URL>",
  "sub":   "<user UUID>",
  "aud":   ["shorinji-persistence"],
  "iat":   1716400000,
  "exp":   1716403600,
  "email": "jane@example.com",
  "role":  ["admin"]
}
```
- `sub` is our internal UUID, not the provider's `sub` — stable across provider changes
- `role` is omitted entirely when the user has no roles
- Signed RS256; the `kid` header is derived from the public key modulus hash, so it rotates
  automatically with the key
- Access token lifetime: **1 hour**; the frontend silently refreshes on 401
- Refresh token: opaque, stored server-side, **30-day** TTL, rotated on every use; logout and
  account deletion revoke server-side

### Provider Configuration (server-side, not stored per-user)
Each provider entry maps a list of email domains to an OIDC issuer + client credentials.
Multiple domains can map to the same provider; enterprise tenants are added by pointing their
corporate domain at the appropriate provider.

---

## API Surface

### Auth Service (`backend/auth`, port 8081 in dev)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Health check |
| GET | `/.well-known/jwks.json` | Public keys for offline JWT verification |
| GET | `/auth/resolve` | Check whether an email domain maps to a provider (used for inline form validation) |
| GET | `/auth/login?email={e}` | Resolve domain → provider, initiate OIDC, redirect |
| GET | `/auth/callback` | OIDC callback: validate, enroll or look up, issue JWT, redirect to frontend |
| POST | `/auth/email/start` | Non-OIDC email login: emails a verification code. Returns `{action}` = `oidc` (redirect instead), `existing`, or `new` (collect a name). Globally rate-limited to 1 req / 5 s |
| POST | `/auth/email/verify` | Verify a code (and name, for new users); creates/looks up the user, issues JWT, sets cookies |
| POST | `/auth/refresh` | Exchange refresh token for new access token (rotates the refresh token) |
| POST | `/auth/logout` | Revoke refresh token, clear cookies |
| GET | `/auth/me` | Return authenticated user info (UUID, email, linkedIdentities) |
| DELETE | `/auth/account` | Delete refresh tokens and the user record (JWT required) |
| POST | `/auth/link?email={e}` | Link an additional provider to the current account (JWT required) |
| DELETE | `/auth/link/{provider}` | Unlink a provider (JWT required; 409 if it is the last one) |
| GET | `/auth/admin/users` | List all users with their roles, linked identities, and an `oidc` flag (admin role required) |
| PATCH | `/auth/admin/users/{id}` | Update a user's display name; 409 for OIDC users (their name comes from the provider) (admin) |
| PUT | `/auth/admin/users/{id}/roles` | Promote/demote a user — body `{admin: bool}`; 409 on self-demotion (admin) |

The `/auth/admin/*` endpoints back the admin-only "Users" page. Authorization is enforced
per handler (`requireAdmin` checks the `admin` role on the access token); listing is a full
scan intended for low-frequency admin use, and filtering happens client-side. Promote/demote
writes the `roles` store, so the change takes effect in a user's token on its next issue
(login or hourly refresh); `/auth/me` reads roles live, so the admin UI reflects it at once.

### Persistence Service (`backend/persistence`, port 8080 in dev)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Health check |
| GET | `/api/v1/document` | Fetch user's document (JWT required) |
| PUT | `/api/v1/document` | Store user's document (JWT required) |
| DELETE | `/api/v1/account` | Delete the user's app data document (JWT required) |
| GET | `/push/public-key` | VAPID public key for browser push subscription |
| POST | `/push/subscribe` | Upsert a push subscription (anonymous allowed; tagged with user if signed in) |
| POST | `/push/unsubscribe` | Remove a push subscription by endpoint |
| POST | `/push/broadcast` | Send a notification to all subscriptions (admin role or `PUSH_ADMIN_TOKEN` bearer) |

The push endpoints are only registered when a VAPID key pair is configured.

---

## GDPR & Legal

We store personal data server-side (email, display name, provider identity), so GDPR applies
for EU residents.

### Data we hold per authenticated user
| Data | Where | Lawful basis |
|------|-------|-------------|
| Internal UUID | `users` container | Contract (account function) |
| Linked identities (`provider`, `sub`, provider email) | `users` container | Contract (account function) |
| Preferred email address | `users` container | Contract (account function) |
| Display name | `users` container | Contract (account function) |
| Login timestamps | `users` container | Legitimate interest (security) |
| App data (grade, notes, ranks, flashcards, etc.) | `documents` container | Contract (core service) |
| Refresh tokens | `refresh_tokens` container | Contract (session management) |
| Push subscriptions (endpoint + keys, optional user ID) | push container | Consent (user subscribes) |

We do **not** collect passwords, payment data, location, or behavioural tracking.

### How user rights are implemented

GDPR requests span both services' data, and the **frontend coordinates the cascade** —
each service only ever deletes or exports its own data, so neither needs credentials to the
other's store. (An earlier design called for a dedicated GDPR service with access to both
stores; it proved unnecessary.)

**Right to erasure (Art. 17)** — "Delete my account" in Settings:
after a confirmation dialog, the frontend calls `DELETE /api/v1/account` (app document),
then `DELETE /auth/account` (refresh tokens, then user record), then clears local auth
state and returns the app to anonymous mode. Deletion is immediate and irreversible.

**Right to data portability (Art. 20)** — "Export my data" in Settings:
the frontend fetches `/auth/me` and `/api/v1/document` and bundles them client-side into a
single dated JSON download. No dedicated export endpoint exists or is needed.

**Right of access (Art. 15)** — covered by `/auth/me` (user record) + the data export.

Both controls are visible only when signed in.

### Legal pages
- **Privacy Policy** (`frontend/src/PrivacyPolicy.tsx`) — authenticated-user section covering
  data held, retention, user isolation, encryption posture, transfer policy, user rights,
  and the data controller's name and contact address (Art. 13)
- **Terms of Service** (`frontend/src/TermsOfServices.tsx`) — account creation, acceptable
  use, and termination; references the Privacy Policy

---

## Web Push Notifications

Standard Web Push (VAPID). The browser subscribes via the service worker using the key from
`GET /push/public-key`; subscriptions are stored server-side, tagged with the user ID when the
subscriber is signed in. `POST /push/broadcast` sends a payload (`title`, `body`, `url`) to
every subscription and prunes dead ones.

Broadcast is authorized two ways:
- a signed-in user holding the `admin` role (web UI path)
- the `PUSH_ADMIN_TOKEN` shared bearer token (scripts/CI path) — the production deploy
  workflow uses this to announce new app versions after a successful deploy

---

## Storage

Each service auto-selects its store at startup: **Cosmos DB** when a Cosmos endpoint is
configured, **file-based** otherwise — so local development is zero-config.

Cosmos layout (single shared throughput pool, free-tier eligible; services self-provision
database and containers on startup):

| Container | Service | Notes |
|-----------|---------|-------|
| `users` | auth | Point reads by UUID; indexing `consistent` with all paths excluded so the admin `SELECT * FROM c` listing works at zero write-time index cost. (An already-provisioned container keeps its old `none` policy — provisioning skips existing containers — so its indexing policy must be updated once out-of-band.) |
| `identity_index` | auth | O(1) provider→user lookup at login |
| `roles` | auth | Out-of-band role assignments, keyed by email |
| `refresh_tokens` | auth | `consistent` indexing (all paths excluded) for partition scans |
| `documents` | persistence | One app data document per user |
| push subscriptions | persistence | Browser push subscriptions |

---

## Frontend Integration

- `"backend"` is a `SyncProvider` in `frontend/src/persistence/schema.ts`;
  `BackendSyncClient` (`frontend/src/sync/backend.ts`) implements the same `CloudSyncClient`
  interface as OneDrive and Google Drive, so debounce / three-way merge / conflict resolution
  are reused as-is
- The sync provider switches to `"backend"` automatically on login and reverts on logout —
  no manual selection is ever shown
- Auth state travels in httpOnly cookies; `fetchWithRefresh` retries once after a silent
  `POST /auth/refresh` on 401
- The login screen is a small state machine: the user enters an email and submits; OIDC domains
  redirect, non-OIDC domains move to a code-entry step (with a name field only for new users),
  driven by the `/auth/email/start` three-way response
- Settings (authenticated): linked providers list with link/unlink, "Export my data",
  "Delete my account"
- On first backend login the sync manager finds no remote document and uploads local data
  automatically via the existing three-way merge path — no migration step needed
- Login page localisation always follows `navigator.languages` (the page appears before user
  identity, and thus language preference, is established)

---

## Deployment

### Production
Pushing to the `deploy` branch runs `.github/workflows/deploy.yml`:

1. **Backend images** — multi-stage Dockerfiles for auth and persistence, pushed to GHCR
2. **Infrastructure** — `infrastructure/main.bicep` (modules: Cosmos DB free tier, Container
   Apps environment, one container app per service) deployed via `az deployment group create`;
   Azure login uses OIDC workload identity federation (no stored Azure secret)
3. **Custom domains** — `auth-shorinjikempo.cash-it.se` and
   `persistence-shorinjikempo.cash-it.se` bound with ACA managed TLS certificates
4. **Frontend** — built with the backend URLs baked in, shipped as a Docker image over SSH to
   the frontend host
5. **Announcement** — a push broadcast ("New version available") via `PUSH_ADMIN_TOKEN`;
   non-fatal if it fails

Scaling: auth runs **min 1 / max 1 replica** (OIDC pending state and verification codes are
held in-process); persistence runs **min 0 / max 1**, scaling on HTTP traffic. Secrets (signing
key, OIDC client secrets, VAPID keys) are injected via ACA secrets; the JWT signing key arrives as
a PEM string (`SERVICE_KEY_PEM`), no file volume needed. Email needs **no secret** — the auth app
authenticates to ACS with its user-assigned managed identity, taking only the non-secret
`ACS_ENDPOINT`, `ACS_SENDER_ADDRESS`, and `ACS_IDENTITY_CLIENT_ID` (the last derived in bicep from
the identity).

`tools/migrate` is a one-shot tool that provisions Cosmos and migrates file-store data
(users + identity index + documents); supports `--dry-run`.

### Staging
**No backend services.** Staging is for testing frontend quality only; backend sign-in is
unavailable there (`VITE_BACKEND_ENABLED` unset hides the identity UI and
`BackendSyncClient` is not wired up). This keeps staging costs at zero and removes GDPR
concerns for the test environment.

### Local development
`docker-compose up` starts the frontend (Vite), auth (`:8081`), and persistence (`:8080`)
with `air` hot-reload for the Go services. Stores default to file-based unless Cosmos
environment variables are supplied; dev-only VAPID keys and a dev broadcast token are baked
into the compose file.
