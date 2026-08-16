# Shorinji Kempo App — Backend Architecture

The app is client-first: user data lives locally and syncs to our own backend. An account is
**required** — the app shows the login screen until a session exists, and every device holds
a full local copy of the document that the backend keeps in step.

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
   |          (no cookie - login screen is shown)          |               |
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

Email goes out over plain **SMTP** (`internal/email`, `net/smtp`), configured with:

| Variable | Meaning |
|---|---|
| `SMTP_HOST` | relay hostname |
| `SMTP_PORT` | `587` for STARTTLS, `465` for implicit TLS (default `587`) |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | credentials; an empty username disables AUTH |
| `SMTP_FROM` | `noreply@example.com` or `Shorinji Kempo <noreply@example.com>` |
| `SMTP_TLS` | `starttls` (explicit, the default), `implicit` (SMTPS), or `none` |

Encryption is not optional in practice: `starttls` **fails** if the server does not advertise
STARTTLS rather than falling back to plaintext, and configuring credentials with `SMTP_TLS=none`
is refused at startup. AUTH prefers PLAIN and falls back to LOGIN when that is all the server
offers (common on Exim/cPanel hosts). The client identifies itself in EHLO as the sender's domain,
since relays routinely reject the `localhost` that `net/smtp` would otherwise send. The recipient is
re-parsed with `mail.ParseAddress` before it reaches a header, so a CR/LF in the address cannot
inject headers of its own.

Each message is **multipart/alternative** — plain text first, HTML second, since a client renders
the last part it understands. Both parts are base64-encoded with a MIME-word subject, because every
language we send in has non-ASCII text. The `From` display name is the app's name in the
recipient's language (matching `frontend/public/site.webmanifest`); the address itself is always
`SMTP_FROM`, so bounces still work. `Reply-To` is set to `noreply@<SMTP_FROM's domain>` — a human
hitting "Reply" lands there instead of in the (unmonitored) `SMTP_FROM` mailbox. The HTML carries the app's gold accent on a card, styled with
inline attributes and layout tables; a `prefers-color-scheme: dark` block in the one `<style>`
element gives a dark card to clients that honour the **reader's** system theme. The app's own
theme setting lives in the browser's `localStorage` and is deliberately not plumbed through — see
`internal/email/email.go`. No images: Gmail blocks `data:` URIs in `<img>`.

When `SMTP_HOST`/`SMTP_FROM` are unset (local dev), codes are logged to stdout instead.

The deploy pipeline feeds the host, port, username, sender and TLS mode in as GitHub repo
*variables* and the password as a repo *secret*, which bicep passes to the container app as an
ACA secret (`smtp-password`). Neither backend app carries a managed identity: Cosmos is reached
with an account key and mail with a password.

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
- `fam` carries the refresh-token **family** of the session the token belongs to, so any
  authenticated endpoint can identify the caller's own session (used by "log out other
  devices"). Omitted on tokens minted before this claim existed
- Refresh token: opaque, stored server-side, **30-day** TTL, rotated on every use. Revoked
  server-side by logout, account deletion, admin force-logout (all of a user's tokens), and
  "log out other devices" (all but the caller's own family)

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
| POST | `/auth/sessions/logout-others` | Revoke every refresh token for the caller except the current session's family (JWT required); 409 if the token predates the `fam` claim |
| GET | `/auth/me` | Return authenticated user info (UUID, email, linkedIdentities) |
| DELETE | `/auth/account` | Delete refresh tokens and the user record (JWT required) |
| POST | `/auth/link?email={e}` | Link an additional provider to the current account (JWT required) |
| DELETE | `/auth/link/{provider}` | Unlink a provider (JWT required; 409 if it is the last one) |
| GET | `/auth/admin/users` | List all users with their roles, linked identities, and an `oidc` flag (admin role required) |
| PATCH | `/auth/admin/users/{id}` | Update a user's display name; 409 for OIDC users (their name comes from the provider) (admin) |
| PUT | `/auth/admin/users/{id}/roles` | Promote/demote a user — body `{admin: bool}`; 409 on self-demotion (admin) |
| POST | `/auth/admin/users/{id}/logout` | Force-logout a user: revoke all their refresh tokens (admin). Their access token stays valid until it expires (≤ 1 h) |

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
| POST | `/push/subscribe` | Upsert a push subscription, tagged with the caller (JWT required) |
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
state and returns the app to the login screen. Deletion is immediate and irreversible.

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

- `SyncProvider` in `frontend/src/persistence/schema.ts` is `"local" | "backend"`;
  `BackendSyncClient` (`frontend/src/sync/backend.ts`) is the only sync client, driving the
  debounce / three-way merge / conflict resolution in `SyncManager`
- The sync provider switches to `"backend"` automatically on login and reverts to `"local"`
  on logout — never selected by hand. It doubles as the gate: `"local"` means signed out, so
  `App` renders the login screen instead of the app
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

### How a deploy is triggered
`.github/workflows/ci.yml` is the only workflow with a trigger. It runs the test
jobs on every push, and gates both deploys behind them with `needs:`:

| Branch pushed    | What runs                                                   |
|------------------|-------------------------------------------------------------|
| anything         | Go tests + frontend tests                                    |
| `deploy-staging` | tests, then `deploy-staging.yml` via `uses:`                 |
| `deploy`         | tests, then `deploy.yml` via `uses:`                         |

`deploy.yml` and `deploy-staging.yml` are reusable workflows (`on: workflow_call`)
holding the deploy steps; neither can be triggered on its own. `ci.yml`'s
`workflow_dispatch` deploys any branch on demand — pick the branch, set the
`deploy` input to `staging` or `production` — which is how a deploy change is
tried out before it reaches a deploy branch.

Two things this shape fixes, both worth not reintroducing:

- **A deploy uses the deploy workflow from the branch being deployed.** A local
  `uses: ./.github/workflows/...` path resolves against the run's own commit.
  The staging deploy used to hang off `workflow_run:`, and GitHub always
  executes those from the *default* branch's copy of the file — so an edited
  deploy step did nothing until merged to `main`, and on 2026-08-13 a staging
  deploy silently dropped a new `FEEDBACK_EMAIL` parameter for exactly that
  reason.
- **A red test stops production.** `deploy.yml` used to trigger on `push`
  itself, running alongside the test workflow rather than after it, so the
  environment that mattered most had the weaker gate — none at all.

### OIDC federated credentials
Azure login is workload identity federation, so the `AZURE_CLIENT_ID` app
registration must hold a federated credential matching the *subject* GitHub
mints for the run. The subject is the ref the run executes from — the `uses:`
call from `ci.yml` does not change that. **Three** credentials are needed, and
all three are live:

    subject                          serves                            credential name
    …:ref:refs/heads/deploy-staging  staging deploy                    github-ref-deploy-staging
    …:ref:refs/heads/deploy          prod deploy                       github-deploy-branch
    …:ref:refs/heads/main            renew-certs.yml                   github-deploy-staging

Read that last column twice. The credential *named* `github-deploy-staging`
is the one carrying the `main` subject, and it has nothing to do with staging
any more — it is what `renew-certs.yml` logs in with. The name is left over
from when staging deploys really did run as `main`. Renaming is not possible
in place; recreating it under an honest name is safe but has to be done as
create-then-delete, since it is live.

That credential is easy to mistake for leftovers. `renew-certs.yml` runs on
`schedule:`, and GitHub always executes a scheduled workflow from the default
branch, so it presents `ref:refs/heads/main` no matter what. **Deleting it
breaks TLS renewal for both environments' backend hostnames** — and it would
once have done so silently, surfacing only at the next bimonthly run or, worse,
when a certificate expired. It now surfaces as a failed run and an email within
a day of the renewal window opening; see the renewal-failure section below.

Staging's deploy used to present `main` as well, because `workflow_run` also
ran in the default branch's context. The first staging deploy after the
`ci.yml` change failed on the difference:

    AADSTS700213: No matching federated identity record found for presented
    assertion subject 'repo:…:ref:refs/heads/deploy-staging'

The pre-existing credential named `github-deploy-staging` is the one carrying
the `main` subject, so adding the staging branch's credential needs a
different name (`github-ref-deploy-staging`) — do not repurpose it.

One consequence of keeping these branch-scoped: a `workflow_dispatch` deploy
from some *other* branch presents that branch's subject and fails the same
way until a credential exists for it. A flexible credential matching
`ref:refs/heads/*`, or subjects keyed on GitHub Environments
(`…:environment:staging`) instead of branches, would cover every branch at
once — deliberately not done, to keep Azure trust narrow.

### Production
Deploying production runs `.github/workflows/deploy.yml`:

1. **Backend images** — multi-stage Dockerfiles for auth and persistence, pushed to GHCR
2. **Infrastructure** — `infrastructure/main.bicep` (modules: Cosmos DB free tier, Container
   Apps environment, one container app per service) deployed via `az deployment group create`;
   Azure login uses OIDC workload identity federation (no stored Azure secret)
3. **Custom domains** — `auth.app.shorinjikempo.net` and
   `persistence.app.shorinjikempo.net`, bound to a certificate `renew-certs.yml` issues via
   Let's Encrypt (DNS-01 through DirectAdmin's API) and uploads as a bring-your-own
   certificate — not ACA's own managed-certificate issuance; see the Staging section below
   for why. Both are subdomains of the frontend origin so that session cookies stay
   same-site; see `cookieDomain` in `infrastructure/main.parameters.json`
4. **Frontend** — built with the backend URLs baked in, rsynced over SSH to the LiteSpeed
   web host
5. **Announcement** — a push broadcast ("New version available") via `PUSH_ADMIN_TOKEN`;
   non-fatal if it fails

Scaling: auth runs **min 1 / max 1 replica** (OIDC pending state and verification codes are
held in-process); persistence runs **min 0 / max 1**, scaling on HTTP traffic. Secrets (signing
key, OIDC client secrets, VAPID keys, SMTP password) are injected via ACA secrets; the JWT signing
key arrives as a PEM string (`SERVICE_KEY_PEM`), no file volume needed.

`tools/migrate` is a one-shot tool that provisions Cosmos and migrates file-store data
(users + identity index + documents); supports `--dry-run`.

### Staging
Staging runs the same backend services as prod, deployed via
`infrastructure/main-staging.bicep` into its own resource group
(`sk-study-app-staging`) so an outage or bad deploy there can't touch prod.
It does **not** get its own Cosmos DB account — Azure allows only one
free-tier account per subscription, and prod already uses it — instead
`modules/cosmos-database.bicep` adds a second database (`shorinji-staging`)
to prod's existing account (`sk-study-app-db`, in the `sk-study-app`
resource group), deployed cross-resource-group from the staging template.
Prod's `shorinji` database and staging's `shorinji-staging` database share
the account's throughput budget (400 RU/s each, well under the free tier's
1000 RU/s cap) but hold completely separate documents.

Everything except the Cosmos account is environment-specific: staging has
its own Container Apps environment, its own JWT signing key
(`STAGING_SIGNING_KEY_PEM`, deliberately not shared with prod so a token
from one environment is never valid against the other), and its own
hostnames (`auth.app-staging.shorinjikempo.net`,
`persistence.app-staging.shorinjikempo.net`). SMTP, Google/Microsoft OAuth,
and VAPID/push credentials are reused from prod's — staging sends real
verification emails through the same relay, so treat staging sign-ins like
real ones.

One-time Azure-side setup this doesn't automate:
- Create the `sk-study-app-staging` resource group.
- Grant the deploy principal (`AZURE_CLIENT_ID`) Contributor on
  `sk-study-app-staging`, plus write access to the `sk-study-app-db` Cosmos
  account (or the whole `sk-study-app` resource group) so it can create the
  `shorinji-staging` database and containers there.
- A federated credential on `AZURE_CLIENT_ID` with subject
  `repo:jorgensigvardsson/shorinji-kempo-study-app:ref:refs/heads/deploy-staging`.
  See "OIDC federated credentials" below — staging's used to name `main`, and
  the first deploy after the `ci.yml` change failed because of it.
- Register `https://auth.app-staging.shorinjikempo.net/auth/callback` as an
  additional redirect URI on the existing Google and Microsoft OAuth
  clients.
- Point `auth.app-staging` and `persistence.app-staging` at the staging
  Container Apps environment: each needs a CNAME to **its own app's default
  FQDN** (`az containerapp show --query properties.configuration.ingress.fqdn`,
  e.g. `sk-study-app-staging-auth.<env-default-domain>`) — **not** to the bare
  environment default domain (`az containerapp env show --query
  properties.defaultDomain`) on its own. The environment's default domain has
  no A/AAAA record of its own; only the per-app hostnames under it do. Pointing
  the CNAME at the bare environment domain looks fine (it resolves, and
  `hostname add`'s ownership check doesn't care) but silently dead-ends DNS
  resolution — this was the actual root cause of the "Operation timed out."
  managed-certificate failures below, not an Azure platform bug as first
  suspected; it just took issuing a real certificate via a different path to
  expose it. Each hostname also needs a `asuid.<hostname>` TXT
  ownership-verification record — the TXT value is each app's own
  `properties.customDomainVerificationId` (`az containerapp show`), fetched
  after the first Bicep deploy creates the apps but before hostname binding
  runs. `app-staging.shorinjikempo.net` itself already exists.
- TLS for these two hostnames — and, since it was generalized, prod's as well
  — comes from `renew-certs.yml`, not Azure's managed-certificate issuance
  (`--validation-method CNAME`). Staging's managed certs repeatedly failed
  with a generic "Operation timed out." error; it looked like a known Azure
  Container Apps platform reliability issue at first, but turned out to be
  the CNAME-target bug above — prod's managed certs were actually healthy
  when this was built, and got switched over anyway for consistency between
  the two pipelines. `renew-certs.yml` runs Let's Encrypt's DNS-01 challenge
  against DirectAdmin's API (Inleed's hosting panel is DirectAdmin-based) via
  `certbot` + `certbot-dns-directadmin` for both environments (a matrix job,
  same DirectAdmin credentials, differing only in resource group/app
  names/hostnames), and uploads the result as a bring-your-own certificate
  (`az containerapp env certificate upload`). `deploy-staging.yml` and
  `deploy.yml`'s hostname-bind steps then bind against that uploaded cert
  (`sk-study-app-staging-cert` / `sk-study-app-cert`) rather than requesting
  a managed one.
  - Create a DirectAdmin Login Key (Kundzon → hosting service → DirectAdmin
    details; if "current password" is rejected, set a fresh DirectAdmin
    password there first — it isn't guaranteed to match your Kundzon
    password) scoped to exactly: `CMD_API_LOGIN_TEST`, `CMD_API_DNS_CONTROL`,
    `CMD_API_SHOW_DOMAINS`, `CMD_API_DOMAIN_POINTER`.
  - This workflow runs on `schedule:`, so (unlike the deploy workflows, which
    `ci.yml` calls from the pushed branch's own checkout) it must be merged to
    `main` to actually fire — GitHub always evaluates a workflow's schedule
    using the copy of the file on the default branch.
  - Bootstrap: run it once manually (workflow_dispatch) before the next
    `deploy-staging.yml`/`deploy.yml` run reaches its hostname-bind step,
    since that step expects the corresponding cert to already exist.

#### What happens when renewal fails
The renewal used to run on `0 3 1 */2 *` — day 1 of every second month — with
no notification of its own beyond GitHub's default mail to whoever last touched
the cron line. That combination had a single point of failure: one red run and
the *next* attempt was ~60 days later, past the 90-day certificate's expiry.
Any transient DirectAdmin, Let's Encrypt or Azure hiccup on that one morning
was enough to take both backend hostnames off HTTPS two months later, with
nothing in between saying so. Let's Encrypt is no help here either — it stopped
sending certificate-expiry reminder mail in June 2025.

It now runs **daily** (`17 3 * * *`) and is idempotent by construction:

- Each run first asks both hostnames, over a real TLS handshake, what
  certificate they are *serving* — not what Azure has stored, since uploading a
  certificate and having a hostname bound to it are separate things and only
  the handshake proves both. That is `.github/scripts/cert-days-left.sh`.
- If more than `RENEW_BEFORE_DAYS` (30) days remain, the run stops there. An
  ordinary day costs two handshakes. If fewer remain — or the handshake fails
  outright, which is the "TLS is already broken" signal — it issues, uploads
  and binds as before.
- So a failed attempt is simply retried tomorrow, and every day after, until it
  succeeds. There are ~30 chances before anything user-visible breaks, instead
  of one. This is also why the threshold survives Let's Encrypt's phased move
  to 45-day certificates without a cadence change.
- After binding, the run re-probes until both hostnames actually serve a
  certificate with more than the threshold left (10 attempts, 30s apart, for
  propagation). A bind that silently kept serving the old certificate used to
  leave a green run behind and expire anyway.
- Every failed attempt emails `CERT_ALERT_EMAIL` (falling back to
  `ACME_CONTACT_EMAIL`) via `.github/scripts/send-alert-email.py`, over the
  same SMTP repository configuration the backend deploys with — no new
  credentials, no third-party action. The subject carries the remaining
  validity and escalates to `[URGENT]` under a fortnight. Both matrix legs
  alert independently, so a staging-only failure is not mistaken for prod.
- Whether alerting is configured at all is checked on *every* run, failing or
  not, and warns if not: an alert path only exercised when something breaks is
  an alert path nobody knows is broken.
- To prove the mail actually *arrives*, dispatch the workflow with the
  `test_alert` input ticked. It sends one alert per environment and stops,
  inspecting and touching no certificates. The `force` input does **not** test
  this: the real alert step is `if: failure()`, so a forced run that succeeds
  sends nothing, and a forced run that fails cannot be ordered on demand.
  `force` tests issuance, `test_alert` tests alerting; they are different
  questions.

Two failure modes this does *not* cover:
- GitHub disables `schedule:` triggers in repositories with no activity for 60
  days. Daily runs are not repository activity — commits are. A dormant repo
  therefore still needs its scheduled workflow re-enabled by hand in the
  Actions tab.
- Each renewal registers a fresh ACME account, because certbot's `--config-dir`
  lives in `$RUNNER_TEMP` and nothing persists between runs. Harmless at this
  volume (accounts are only registered when a renewal is actually attempted),
  but it is why the daily run must skip rather than reissue.

Required repository configuration beyond what prod already had before staging existed:
- Variable `AZURE_RESOURCE_GROUP_STAGING` — the staging resource group name.
- Secret `STAGING_SIGNING_KEY_PEM` — a signing key generated the same way as
  prod's (`openssl genrsa 2048`), but a different key.
- Variables `DIRECTADMIN_SERVER` (e.g. `https://s001.example.com:2222`) and
  `DIRECTADMIN_USERNAME`, and secret `DIRECTADMIN_LOGIN_KEY` — the scoped
  Login Key described above. Shared by both matrix legs of
  `renew-certs.yml`, not staging-specific.
- Variable `ACME_CONTACT_EMAIL` — contact address for the Let's Encrypt
  account used by `renew-certs.yml`. Also shared, not staging-specific.
- Variable `CERT_ALERT_EMAIL` — optional. Where `renew-certs.yml` mails its
  renewal failures; defaults to `ACME_CONTACT_EMAIL`. Set it to reach someone
  other than the Let's Encrypt account contact, or to a comma-separated list.
  The mail itself goes out over the existing `SMTP_HOST`/`SMTP_PORT`/
  `SMTP_USERNAME`/`SMTP_FROM`/`SMTP_TLS` variables and `SMTP_PASSWORD` secret.

### Local development
`docker-compose up` starts the frontend (Vite), auth (`:8081`), and persistence (`:8080`)
with `air` hot-reload for the Go services. Stores default to file-based unless Cosmos
environment variables are supplied; dev-only VAPID keys and a dev broadcast token are baked
into the compose file.
