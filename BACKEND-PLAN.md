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
2. User picks "Sign in" → selects a provider (Google, Microsoft, ...)
3. Browser redirects to `GET /auth/login?provider=google` on the auth service
4. Auth service initiates OIDC flow with the provider
5. Provider authenticates the user, redirects back to auth service callback
6. Auth service validates ID token, looks up or enrolls the user, issues a signed JWT
7. Auth service redirects to the frontend; JWT is delivered as an httpOnly cookie
8. Frontend detects successful login, switches sync provider to `"backend"`
9. App syncs data via the persistence service (JWT cookie sent automatically)
10. Subsequent visits: cookie present → already authenticated, no re-login
11. JWT expiry: silent refresh via refresh token, or prompt to re-login

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
   | Redirect to GET /auth/login?provider=google           |               |
   |-------------------------------------------------->    |               |
   |                               Build OIDC URL          |               |
   |                               + state + nonce         |               |
   | Redirect to provider                                  |               |
   |<--------------------------------------------------|                   |
   | Authenticate with provider                                            |
   |---------------------------------------------------------------->|     |
   | Redirect to /auth/callback?code=...&state=...                        |
   |<----------------------------------------------------------------|     |
   |-------------------------------------------------->|                   |
   |                               Validate state                          |
   |                               Exchange code for tokens                |
   |                               Validate ID token                       |
   |                               Look up / enroll user ----------------->|
   |                               Issue JWT                               |
   | Redirect to frontend, set httpOnly cookies         |               |
   |<--------------------------------------------------|                   |
   | App resumes; sync provider = "backend"            |               |
```

---

## Data Models

### User Record (Cosmos DB — `users` container)
```json
{
  "id":          "google:1234567890",
  "provider":    "google",
  "sub":         "1234567890",
  "email":       "user@example.com",
  "displayName": "Jane Doe",
  "createdAt":   "2026-05-22T18:00:00Z",
  "lastLoginAt": "2026-05-22T18:00:00Z"
}
```
`id` is `"{provider}:{sub}"` — stable across logins, unique per provider.

### App Data Document (Cosmos DB — `documents` container)
```json
{
  "id":        "google:1234567890",
  "userId":    "google:1234567890",
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
  "sub": "google:1234567890",
  "iat": 1716400000,
  "exp": 1716403600,
  "email": "user@example.com"
}
```
- Access token lifetime: ~1 hour
- Refresh token: opaque, stored server-side, rotated on use

---

## API Surface

### Auth Service (`backend/auth`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Health check |
| GET | `/.well-known/jwks.json` | Public keys for offline JWT verification |
| GET | `/auth/login?provider={p}` | Initiate OIDC, redirect to provider |
| GET | `/auth/callback` | OIDC callback: validate, enroll, issue JWT, redirect to frontend |
| POST | `/auth/refresh` | Exchange refresh token for new access token |
| POST | `/auth/logout` | Revoke refresh token, clear cookies |
| GET | `/auth/me` | Return authenticated user info |

### Persistence Service (`backend/persistence`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Health check |
| GET | `/api/v1/document` | Fetch user's document (JWT required) |
| PUT | `/api/v1/document` | Store user's document (JWT required) |
| GET | `/api/v1/account/export` | Export all user data as JSON (JWT required) |
| DELETE | `/api/v1/account` | Delete account: user record, app data, refresh tokens (JWT required) |

---

## GDPR & Legal

The moment we store personal data server-side (email, display name, provider identity) we
are almost certainly subject to GDPR for EU residents. The following requirements apply.

### Data we hold per authenticated user
| Data | Where | Lawful basis |
|------|-------|-------------|
| Provider identity (`sub`, `provider`) | `users` container | Contract (account function) |
| Email address | `users` container | Contract (account function) |
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

**Send Feedback** (wherever implemented in the frontend)
- Authenticated users: optionally attach their user ID for follow-up (opt-in, not automatic)
- Must work anonymously too — do not auto-include personal data

---

## Frontend Changes

### New sync provider
- Add `"backend"` to the `SyncProvider` union in `frontend/src/persistence/schema.ts`
- Implement `BackendSyncClient` satisfying the existing `CloudSyncClient` interface in
  `frontend/src/sync/manager.ts`
  - `downloadDocument()` → `GET /api/v1/document` (cookie sent automatically)
  - `uploadDocument(doc)` → `PUT /api/v1/document`
  - `isConnected()` → check `/auth/me` or presence of a session marker
  - `beginAuthorization()` → redirect to `/auth/login?provider=...`
  - `completeAuthorizationIfPresent()` → detect post-login redirect from auth service
- The existing debounce / three-way merge / conflict-resolution logic is reused for free

### Identity choice UI
- Shown on first visit (or accessible from Settings)
- "Continue anonymously" → existing behaviour, unchanged
- "Sign in with Google / Microsoft" → triggers `BackendSyncClient.beginAuthorization()`
- After login: sync provider auto-switches to `"backend"`

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
- One provider: Google
- User lookup / enrollment with a file-based stub (same pattern as persistence)
- JWT issuance, httpOnly cookie delivery

### Phase 2 — Persistence: JWT validation
- Fetch and cache JWKS from auth service on startup
- Reject unauthenticated requests (401)
- Use `sub` claim as document key (replaces `"default"`)

### Phase 3 — Frontend: BackendSyncClient
- Implement `BackendSyncClient`
- Add `"backend"` to `SyncProvider`
- Wire into the Settings sync-provider picker

### Phase 4 — Identity choice UI
- First-visit screen: anonymous vs sign in
- Provider picker
- Post-login redirect handling

### Phase 5 — Microsoft provider + data migration
- Microsoft OIDC (client ID already exists for OneDrive auth)
- Data migration helper (import from OneDrive / Google Drive)

### Phase 6 — GDPR compliance
- `GET /api/v1/account/export` — bundle user record + app document into downloadable JSON
- `DELETE /api/v1/account` — cascade delete: app document → refresh tokens → user record
- Settings UI: "Export my data" and "Delete my account" controls (authenticated only)
- Privacy Policy and Terms of Service updated for authenticated users
- Send Feedback opt-in for user ID attachment
- ToS acceptance recorded on first login

### Phase 7 — Production hardening
- Replace file stores with Cosmos DB in both services
- Refresh token rotation and revocation
- Config-driven provider list for future additions

---

## Open Questions
- Which OIDC providers beyond Google and Microsoft?
- Deployment topology: same host, separate containers, Azure Container Apps?
- Should the frontend show the user's display name / avatar when signed in?
- Multi-device behaviour: when a user signs in on a second device, merge or overwrite?
- Rate limiting / abuse protection on auth endpoints

---
*Last updated: 2026-05-22 — added GDPR & Legal section, account export/deletion API, legal page update requirements, Phase 6*
