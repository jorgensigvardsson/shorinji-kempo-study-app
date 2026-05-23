# Shorinji Kempo App — Backend Architecture Plan

## Vision

The app today is fully client-side: user data syncs to OneDrive or Google Drive with no
backend of our own. This plan introduces a lightweight backend that provides:
- First-class user identity via OIDC (federated login, no passwords)
- Our own persistence service for user data (alternative to OneDrive/Google Drive)
- A reusable auth foundation for future backend features

The existing anonymous / OneDrive / Google Drive flow remains **unchanged**. Backend
identity is opt-in.

---

## User Journeys

### Journey A: Anonymous (unchanged)
1. User opens the app
2. App loads with local data, optionally syncing to OneDrive or Google Drive
3. No backend interaction at all

### Journey B: OIDC Identity (new)
1. User opens the app → sees choice: "Continue anonymously" or "Sign in"
2. User picks "Sign in" → is prompted to enter their email address
3. Frontend sends the email to `GET /auth/login?email=foo@company.com` on the auth service
4. Auth service extracts the domain (`company.com`), looks it up in the provider config,
   and initiates the OIDC flow for that provider (state + nonce generated server-side)
5. Auth service redirects the browser to the OIDC provider
6. Provider authenticates the user, redirects back to `GET /auth/callback`
7. Auth service validates state + nonce, exchanges code for tokens, validates the ID token
8. Auth service looks up the user by `(provider, sub)` in `linkedIdentities`:
   - **Existing user:** update `lastLoginAt`, optionally sync latest email from provider
   - **New user:** generate a UUID, create a user record with this provider linked
9. Auth service issues a signed JWT (`sub` = our UUID), delivers it as an httpOnly cookie,
   and redirects to the frontend
10. Frontend detects successful login, switches sync provider to `"backend"`
11. App syncs data via the persistence service (JWT cookie sent automatically)
12. Subsequent visits: cookie present → already authenticated, no re-login
13. JWT expiry: silent refresh via refresh token, or prompt to re-login

---

## Services

### `backend/auth` — Identity & Token Service

**Responsibilities:**
- Initiate OIDC flows and handle provider callbacks
- Validate ID tokens (signature, issuer, audience, expiry, nonce)
- Enroll new users (first login → create user record in DB)
- Issue signed JWTs (short-lived access token + longer-lived refresh token)
- Serve public keys at `/.well-known/jwks.json` so other services can verify tokens
  offline without calling back to the auth service
- Refresh and revoke tokens; handle logout

**Does NOT:** store app data or know about grades, notes, hokei, etc.

### `backend/persistence` — Data Persistence Service (exists today)

**Responsibilities:**
- Store and retrieve `AppDataDocument` per authenticated user
- Validate the JWT by verifying its signature against the auth service's published JWKS
- Extract the user identity from the JWT `sub` claim → use as the storage key
  (replaces the current `"default"` placeholder)
- File-based store today; Cosmos DB in production

**Does NOT:** know about OIDC or issue tokens.

### `backend/gdpr` — GDPR Compliance Service *(Phase 6)*

**Responsibilities:**
- `GET /gdpr/export` — bundle the user record (from auth store) + app data (from persistence
  store) into a single downloadable JSON archive
- `DELETE /gdpr/account` — cascade delete: app document → refresh tokens → user record;
  confirmation token required to prevent accidents
- Rate limited hard (1 req/min per IP, burst 2); requires valid JWT on all endpoints

**Why a separate service?**
GDPR requests span *both* the auth store and the persistence store. Adding these endpoints to
either existing service would require it to reach into the other service's data, violating the
separation of responsibility. A dedicated service gets credentials to both stores directly and
is the only component that does cross-store coordination.

In production (Azure Container Apps) this service can run at **min-replicas = 0** — it costs
nothing until someone actually clicks "delete my account," which happens on the order of once
or twice per year.

**Does NOT:** issue tokens, handle OIDC, or act as a general data API.

---

## OIDC Auth Flow

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

---

## Data Models

### User Record (Cosmos DB — `users` container)
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
- `email` is the user's preferred contact address, editable independently of any provider email
- `linkedIdentities` maps provider name → `{sub, email}` for each linked provider;
  a user may link additional providers after first login
- Lookup by provider: scan `linkedIdentities[provider].sub`; only done at login time,
  then UUID is used for everything else

### Provider Configuration (server-side, not stored per-user)
```json
{
  "providers": [
    {
      "name":     "google",
      "issuer":   "https://accounts.google.com",
      "clientId": "...",
      "domains":  ["gmail.com", "googlemail.com"]
    },
    {
      "name":     "microsoft",
      "issuer":   "https://login.microsoftonline.com/common/v2.0",
      "clientId": "...",
      "domains":  ["outlook.com", "hotmail.com", "live.com", "company.com"]
    }
  ]
}
```
- `domains` is the list of email domains that trigger this provider
- Multiple domains can map to the same provider (e.g. all Microsoft consumer domains)
- Enterprise tenants add their corporate domain pointing to the Microsoft (or other) provider
- Provider discovery is driven entirely by the email domain the user types; no provider
  picker is shown

### App Data Document (Cosmos DB — `documents` container)
```json
{
  "id":        "550e8400-e29b-41d4-a716-446655440000",
  "userId":    "550e8400-e29b-41d4-a716-446655440000",
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
  "iss": "https://auth.shorinji.example.com",
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "iat": 1716400000,
  "exp": 1716432800,
  "email": "jane@example.com"
}
```
- `sub` is our internal UUID, not the provider's `sub` — stable across provider changes
- `email` is the user's preferred email from their user record
- Access token lifetime: 8 hours (covers a full training day)
- Refresh token: opaque, stored server-side, rotated on use

---

## API Surface

### Auth Service (`backend/auth`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Health check |
| GET | `/.well-known/jwks.json` | Public keys for offline JWT verification |
| GET | `/auth/login?email={e}` | Resolve domain → provider, initiate OIDC, redirect |
| GET | `/auth/callback` | OIDC callback: validate, enroll or look up, issue JWT, redirect to frontend |
| POST | `/auth/refresh` | Exchange refresh token for new access token |
| POST | `/auth/logout` | Revoke refresh token, clear cookies |
| GET | `/auth/me` | Return authenticated user info (UUID, email, linkedIdentities) |
| POST | `/auth/link?email={e}` | Link an additional provider to the current account (JWT required) |
| DELETE | `/auth/link/{provider}` | Unlink a provider (JWT required; last provider cannot be unlinked) |

### Persistence Service (`backend/persistence`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Health check |
| GET | `/api/v1/document` | Fetch user's document (JWT required) |
| PUT | `/api/v1/document` | Store user's document (JWT required) |
| POST | `/api/v1/feedback` | Submit feedback with user identity attached (JWT required) |

### GDPR Service (`backend/gdpr`) *(Phase 6)*

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Health check |
| GET | `/gdpr/export` | Export all user data as JSON archive (JWT required) |
| POST | `/gdpr/account/delete-request` | Issue a deletion confirmation token, email it to the user (JWT required) |
| DELETE | `/gdpr/account` | Cascade delete after confirmation token (JWT required) |

---

## GDPR & Legal

The moment we store personal data server-side (email, display name, provider identity) we
are almost certainly subject to GDPR for EU residents. The following requirements apply.

### Data we hold per authenticated user
| Data | Where | Lawful basis |
|------|-------|-------------|
| Internal UUID | `users` container | Contract (account function) |
| Linked identities (`provider`, `sub`, provider email) | `users` container | Contract (account function) |
| Preferred email address | `users` container | Contract (account function) |
| Display name | `users` container | Contract (account function) |
| Login timestamps | `users` container | Legitimate interest (security) |
| App data (grade, notes, ranks, flashcards, etc.) | `documents` container | Contract (core service) |
| Refresh tokens | server-side store | Contract (session management) |

We do **not** collect passwords, payment data, location, or behavioural tracking.

### User rights we must honour

**Right to erasure (Art. 17)** — "Delete my account"
- Deletes the user record, all app data, and all active refresh tokens
- Irreversible; a confirmation step is required in the UI
- Must complete within 30 days (aim for immediate)

**Right to data portability (Art. 20)** — "Export my data"
- Returns everything we hold: user record + full app data document, as a single JSON file
- Extends the existing anonymous export (same format, adds the user record wrapper)

**Right of access (Art. 15)** — covered by `/auth/me` (user record) + data export

**Consent & transparency**
- Users must explicitly accept the Terms of Service on first OIDC login (checkbox, not pre-ticked)
- The Privacy Policy must clearly state what is collected, why, retention period, and how to exercise rights

### Legal page updates required

**Privacy Policy** (`frontend/src/PrivacyPolicy.tsx`)
- Add section for authenticated users: what data is stored, why, and for how long
- List user rights and how to exercise them (account deletion, export)
- Identify the data controller

**Terms of Service** (`frontend/src/TermsOfServices.tsx`)
- Add section covering account creation, acceptable use, and termination
- Reference the data handling described in the Privacy Policy

**Send Feedback**
- Anonymous users: existing email-based flow, unchanged
- Authenticated users: POST to backend (`POST /api/v1/feedback`); no email address exposed
  in the frontend bundle; backend forwards or stores the message server-side
- User ID attached automatically for authenticated feedback (no opt-in needed — the user
  chose to be identified by logging in); message content is still voluntary

**Data controller contact (Art. 13 requirement)**
- The Privacy Policy must identify the data controller by name and provide a contact address
- This contact address must be reachable for data subject requests (access, erasure, portability)
- The feedback/contact email already used for the app is the natural choice
- Must be a real, monitored address — not a no-reply

---

## Frontend Changes

### New sync provider
- Add `"backend"` to the `SyncProvider` union in `frontend/src/persistence/schema.ts`
- Implement `BackendSyncClient` satisfying the existing `CloudSyncClient` interface in
  `frontend/src/sync/manager.ts`
  - `downloadDocument()` → `GET /api/v1/document` (cookie sent automatically)
  - `uploadDocument(doc)` → `PUT /api/v1/document`
  - `isConnected()` → check `GET /auth/me`; treat 200 as connected
  - `beginAuthorization(email)` → redirect to `/auth/login?email=<email>`
  - `completeAuthorizationIfPresent()` → detect post-login redirect from auth service
  - `disconnect()` → call `POST /auth/logout`
- The existing debounce / three-way merge / conflict-resolution logic is reused for free
- **No manual selection in Settings**: authenticated users are always on `"backend"` sync;
  the sync provider switches automatically on login and reverts on logout.
  Settings shows the current sync state read-only for authenticated users.

### Identity choice UI
- Shown on first visit (or accessible from Settings)
- "Continue anonymously" → existing behaviour, unchanged
- "Sign in" → shows an email input field; no provider list is presented to the user
  - User types their email address (e.g. `jane@company.com`)
  - Frontend calls `BackendSyncClient.beginAuthorization(email)` which redirects to
    `GET /auth/login?email=jane@company.com`
  - If the domain is not recognised, the auth service returns an error; frontend shows
    "Sign-in is not available for this email domain"
- After login: sync provider auto-switches to `"backend"`

### Account linking (Settings, authenticated users)
- "Link another account" → shows the same email input; redirects to `/auth/link?email=...`
- "Unlink {provider}" → calls `DELETE /auth/link/{provider}`; disabled when only one provider is linked

### Data migration helper *(nice-to-have)*
- After first OIDC login, if OneDrive or Google Drive data exists, offer "import from cloud"
- Uses the existing JSON export/import path + three-way merge

### GDPR controls in Settings (authenticated users only)
- **Export my data** — calls `GET /api/v1/account/export`, downloads JSON file
- **Delete my account** — calls `DELETE /api/v1/account` after a confirmation dialog;
  logs user out and returns to anonymous mode
- Both controls visible only when signed in; hidden for anonymous users

### Legal page updates
- **Privacy Policy** — new authenticated-user section (data collected, retention, rights, controller)
- **Terms of Service** — new account/usage terms section, reference to Privacy Policy
- **Send Feedback** — opt-in checkbox to attach user ID; never included automatically

---

## Implementation Phases

### Phase 1 — Auth Service skeleton
- `backend/auth` Go service (mirrors persistence structure)
- JWKS endpoint so persistence can verify tokens offline
- Provider config with `domains[]` array; domain-to-provider lookup at login
- One provider configured: Google (`gmail.com`, `googlemail.com`)
- Email-based login: `GET /auth/login?email=...` extracts domain → selects provider
- User model: UUID primary key, `linkedIdentities` map, preferred email
- `FindByLinkedIdentity(provider, sub)` scan on enrollment / login
- JWT issuance with `sub` = internal UUID; httpOnly cookie delivery

### Phase 2 — Persistence: JWT validation
- Fetch and cache JWKS from auth service on startup
- Reject unauthenticated requests (401)
- Use `sub` claim as document key (replaces `"default"`)

### Phase 3 — Frontend: BackendSyncClient
- Implement `BackendSyncClient`
- Add `"backend"` to `SyncProvider`
- Sync provider switches to `"backend"` automatically on successful OIDC login;
  reverts to previous provider on logout — no manual selection ever shown to the user

### Phase 4 — Identity choice UI
- First-visit screen: anonymous vs sign in
- Provider picker
- Post-login redirect handling

### Phase 5 — Microsoft provider + data migration
- Microsoft OIDC (client ID already exists for OneDrive auth)
- Data migration helper (import from OneDrive / Google Drive)

### Phase 6 — GDPR compliance
New `backend/gdpr` Go service (same structure as auth/persistence):
- `GET /gdpr/export` — reads user record from auth store + app data from persistence store;
  returns a single JSON archive; requires valid JWT; response as `Content-Disposition: attachment`
- `DELETE /gdpr/account` — accepts a confirmation token (issued by a prior `POST /gdpr/account/delete-request`);
  deletes app data, refresh tokens, then user record in that order; returns 204
- `POST /gdpr/account/delete-request` — issues a short-lived (15 min) confirmation token and
  emails it to the user's address; prevents accidental deletion
- All endpoints rate limited (1 req/min per IP, burst 2)
- Docker Compose: new `gdpr` service; both `auth_data` and `persistence_data` volumes mounted
- Settings UI: "Export my data" and "Delete my account" controls (authenticated only)
- Privacy Policy and Terms of Service updated for authenticated users
- `POST /api/v1/feedback` on persistence — receive authenticated feedback, forward/store server-side
- Send Feedback page: authenticated path posts to backend; anonymous path sends email as before
- ToS acceptance checkbox recorded on first login (stored in user record)
- Privacy Policy updated with data controller name and contact address

### Phase 7 — Production hardening
- Replace file stores with Cosmos DB in both services
- Refresh token rotation and revocation
- Config-driven provider list for future additions

### Phase 8 — More OIDC providers
Two categories of provider support:

**Email-domain providers** (same `GET /auth/login?email=...` flow; just add more entries to
provider config):
- Microsoft / Entra ID — `outlook.com`, `hotmail.com`, `live.com`, plus any enterprise tenant domain
- Yahoo — `yahoo.com`, `yahoo.co.uk`, etc.
- Apple — `icloud.com`, `me.com`, `mac.com`
- Any standard OIDC provider reachable by domain

**Button providers** (no email → domain mapping; user picks from a list):
These providers do not expose a usable email domain (e.g. GitHub users may use any address).
The login screen adds explicit buttons for them:
- GitHub
- Discord
- GitLab
- Facebook
- LinkedIn
- Twitch
- Reddit

Button providers use `GET /auth/login?provider={name}` (no email parameter); the auth service
bypasses the domain lookup and goes directly to the selected provider.

Account linking works for both categories: an existing user can add a button provider to their
account via `POST /auth/link?provider={name}`.

### Phase 9 — Deploy to Azure Container Apps
- Containerise all services (`backend/auth`, `backend/persistence`, `backend/gdpr`) with
  multi-stage Dockerfiles; push images to GitHub Container Registry (GHCR) via GitHub Actions
- Provision Azure Container Apps environment (one environment, three container apps)
- `gdpr` app: **min-replicas = 0**, scale on HTTP traffic — costs nothing at rest
- `auth` and `persistence`: min-replicas = 1 (always available for active users)
- Cosmos DB for both user store and document store; connection strings via ACA secrets
- HTTPS termination handled by ACA ingress; no nginx/reverse proxy needed
- GitHub Actions deployment workflow: build → push to GHCR → `az containerapp update`
- Custom domain + managed TLS certificate via ACA domain binding

---

## Deployment Policy

**Staging:** No backend services. The staging environment is for testing app (frontend) quality
only; nobody should be storing personal data there. Backend sign-in is simply unavailable on
staging — the identity choice UI is hidden and `BackendSyncClient` is not wired up.
This keeps staging costs at zero and removes GDPR concerns for the test environment.

**Production:** Full backend stack (auth + persistence), Cosmos DB, HTTPS, rate limiting.

---

## Open Questions
- Should the frontend show the user's avatar when signed in (Google provides a photo URL)?
- Multi-device behaviour: when a user signs in on a second device, merge or overwrite?

---
*Last updated: 2026-05-23 — added backend/gdpr service (Phase 6); added Phase 8 (more OIDC providers, button-provider category); added Phase 9 (Azure Container Apps deployment with GHCR, scale-to-zero for gdpr service); resolved open questions on topology and provider list; rate limiting rule added to CLAUDE.md*
