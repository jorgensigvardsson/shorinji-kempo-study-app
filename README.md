# Shorinji Kempo Study App

A Progressive Web App (PWA) for Shorinji Kempo practitioners to study techniques, terminology, and grade curricula. Built with React 19, TypeScript, and Vite.

## Features

- **Kamoku** — weekly training schedule by grade, with techniques and forms organized per session
- **All Hokei** — browse and filter all techniques across all grades
- **Technique Groups** — explore techniques organized by category
- **Word List** — searchable dictionary of kanji, romaji, and technique terminology
- **Quiz** — rapid-fire questions testing technique names and terminology, with streak counter and synced all-time high score
- **Flashcards** — spaced-repetition learning tool (non-Japanese languages)
- **Notes & ratings** — attach personal notes and star ratings to individual techniques
- **Cloud sync** — data syncs automatically to OneDrive, Google Drive, or Dropbox
- **Push notifications** — opt-in Web Push (e.g. new-version announcements) delivered even when the app is closed
- **Multilingual** — Swedish (default/fallback), English, Turkish, Japanese

## Tech stack

- React 19 + TypeScript + Vite
- React Router 7
- Bootstrap 5
- Vitest + Testing Library
- PWA with service worker for offline use
- Go backend services for identity (OIDC + email verification codes) and data persistence — see [BACKEND.md](BACKEND.md)
- Azure Communication Services (Email) for sending verification codes — authenticated by a user-assigned managed identity (no stored key); see [BACKEND.md](BACKEND.md)

## Development

```bash
npm install
npm run dev       # start dev server
npm test          # run tests
npm run build     # production build
```

## Translation workflow

To send a language section to an external translator who doesn't use git:

```bash
npm run translations:export -- ja   # exports translation-exports/ja.json + baseline
# send ja.json to translator, receive it back
npm run translations:import -- ja   # three-way merges into translations.json
```

`translation-exports/` is gitignored. The baseline snapshot is kept alongside the working copy so that concurrent changes on your side are preserved during the merge. Conflicts are marked inline as `<<<CONFLICT OURS: … | THEIRS: …>>>` for manual resolution.

## Push notifications

Notifications use the standard [Web Push Protocol](https://web.dev/articles/push-notifications-overview) with VAPID — no third-party push service, no recurring cost. The browser's own push service (Chrome/FCM, Edge/WNS, Firefox/Mozilla, Safari/APNs) delivers the message; the persistence backend signs it with the VAPID private key.

**Pieces:**
- The service worker (`frontend/src/sw.ts`) handles the `push` and `notificationclick` events.
- The persistence service (`backend/persistence`) serves `GET /push/public-key`, stores subscriptions via `POST /push/subscribe` / `POST /push/unsubscribe`, and broadcasts via `POST /push/broadcast`. Subscriptions are anonymous unless an `access_token` cookie ties them to a signed-in user. Dead subscriptions (HTTP 404/410) are pruned automatically.
- Settings → *Uppdateringsnotiser* lets the user opt in/out. On iOS the app must be added to the Home Screen first (Apple only allows Web Push for installed PWAs).

**Generate VAPID keys once** (stable forever — rotating them invalidates every existing subscription):
```bash
npx web-push generate-vapid-keys
```
Set the public key as the `VAPID_PUBLIC_KEY` repo *variable*, the private key as the `VAPID_PRIVATE_KEY` *secret*. Push endpoints stay disabled until both are present. The dev compose stack ships throwaway keys for `localhost`.

**Sending a broadcast** (e.g. announcing a new version). Three ways, all hit `POST /push/broadcast`:

- **Automatically on deploy** — the final step of the `deploy` workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) sends a "New version available" notification once the stack restart succeeds. It uses `PUSH_ADMIN_TOKEN`; if that secret is unset the step is skipped, and a failed broadcast only warns (it never fails an otherwise-successful deploy).
- **From the app** — a signed-in user with the `admin` role gets a *Skicka notis till alla* form under Settings. The browser session cookie authorizes the call.
- **From a script/CI** — present the `PUSH_ADMIN_TOKEN` as a bearer token:
  ```bash
  curl -X POST https://persistence.app.shorinjikempo.net/push/broadcast \
    -H "Authorization: Bearer $PUSH_ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"New version available","body":"Open the app to update.","url":"/changelog"}'
  ```

### Roles & the `admin` role

The auth service stamps a `role` claim onto each access token, read from a Cosmos `roles` container (provisioned automatically on startup) and refreshed on every login and token refresh. The claim is forwarded to the web app via `GET /auth/me` so the UI can show or hide admin-only controls. The persistence service trusts the same claim to authorize broadcasts.

To grant someone the `admin` role, add an item to the `roles` container keyed by their (lowercased) email:
```json
{ "id": "someone@example.com", "roles": ["admin"] }
```
The change takes effect on their next login or hourly token refresh. Locally (file-store dev, no Cosmos), the same mapping lives in `backend/auth/data/roles/roles.json`: `{ "someone@example.com": ["admin"] }`.

## Deployment

Pushes to the `deploy` branch trigger the GitHub Actions workflow. See [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) for details.

The backend is built into container images and deployed to Azure Container Apps. The frontend is built with Vite on the runner and `rsync`ed over SSH to the production web host, which runs LiteSpeed and serves the files statically from `~/domains/app.shorinjikempo.net/public_html`. The sync is a full synchronisation (`--delete-after`), so files removed from the build are removed from the web root; `.well-known/` and `cgi-bin/` are excluded so host-managed content survives.

Server rules for the frontend live in [`frontend/public/.htaccess`](frontend/public/.htaccess) — SPA routing, security headers, and cache policy. Vite copies `public/` into `dist/`, so the file ships with the build and lands in the web root automatically.

The workflow writes `.env.production` from repository secrets/vars before building, since `.env.*` files are gitignored.

TLS for the backend's custom domains (`auth.app.shorinjikempo.net`, `persistence.app.shorinjikempo.net`) comes from a separate scheduled workflow, [`.github/workflows/renew-certs.yml`](.github/workflows/renew-certs.yml), which issues certificates via Let's Encrypt (DNS-01 through DirectAdmin's API) and uploads them as bring-your-own certificates rather than relying on Azure Container Apps' own managed-certificate issuance. See [`BACKEND.md`](BACKEND.md) for why and how.

Required repository secrets:
- `SSH_PRIVATE_KEY` — private key for the deploy user; its public half belongs in that user's `~/.ssh/authorized_keys` on the web host
- `VAPID_PRIVATE_KEY` — Web Push VAPID private key (paired with the `VAPID_PUBLIC_KEY` variable)
- `PUSH_ADMIN_TOKEN` — bearer token authorizing `POST /push/broadcast` (leave unset to disable broadcasts)
- `SMTP_PASSWORD` — password for the mail relay that sends sign-in codes (leave unset to log codes instead of mailing them)
- `VITE_FEEDBACK_EMAIL` — comma-separated feedback recipient(s)
- `VITE_ONEDRIVE_CLIENT_ID` — OneDrive OAuth public client ID
- `VITE_GOOGLE_CLIENT_ID` — Google Drive OAuth public client ID
- `VITE_GOOGLE_CLIENT_SECRET` — Google Drive OAuth client secret. Google's token endpoint requires this for Web-application clients even with PKCE; the secret is baked into the SPA bundle. The dedicated Drive-sync OAuth client must be restricted to the `drive.appdata` scope only.

Required repository variables (these are *variables*, not secrets — they are not sensitive, and leaving them unmasked keeps deploy logs readable):
- `SSH_HOST` (`hostname:port`, e.g. `prime4.inleed.net:2020`), `SSH_USER` — deploy target. The port is mandatory; the workflow splits the value on the colon and there is no default.
- `FRONTEND_URL` — the production origin, no trailing slash. Becomes the backend's CORS allowed origin, which is compared to the browser's `Origin` header by exact string match.
- `VITE_AUTH_URL`, `VITE_API_URL` — backend service origins, no trailing slash. A trailing slash produces doubled slashes in request paths, which Go's `ServeMux` answers with a 301 — fatal for CORS preflight.

Optional repository variables (with sensible defaults):
- `VAPID_PUBLIC_KEY` — Web Push VAPID public key; `VAPID_SUBJECT` — `mailto:` or site URL for the VAPID claim. Push endpoints stay disabled until the public/private key pair is set.
- `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_FROM` — mail relay for email (code) sign-in, paired with the `SMTP_PASSWORD` secret. `SMTP_FROM` may carry a display name: `Shorinji Kempo <noreply@example.com>`. With `SMTP_HOST` or `SMTP_FROM` unset the auth service logs codes to stdout instead of sending them.
- `SMTP_PORT` (default `587`) and `SMTP_TLS` (default `starttls`) — use `465`/`implicit` for SMTPS. `starttls` refuses to deliver over an unencrypted connection rather than falling back to one.
- `VITE_DEBUG` (default `false`)
- `VITE_ONEDRIVE_TENANT_ID` (default `consumers`)
- `VITE_ONEDRIVE_REDIRECT_URI`, `VITE_GOOGLE_REDIRECT_URI` — only set if the redirect URI differs from `<origin>/`

## Deployment staging
Deployments may be done to the staging environment. Same rules apply for the staging environment as for the production environment. The differences: push to the branch `deploy-staging`, and the site syncs to `~/domains/app-staging.shorinjikempo.net/public_html` on the same host.

Staging also deploys its own auth and persistence services, into a separate Azure resource group, so backend sign-in and sync can be tested there too. It shares prod's Cosmos DB account rather than provisioning a second one — see [BACKEND.md](BACKEND.md#staging) for the full setup, including the one-time Azure configuration it doesn't automate.

The staging build sets `VITE_ENVIRONMENT=staging`, which shows a small "Staging environment" label fixed to the bottom-left corner of every screen — a quick visual cue that staging and prod would otherwise not have, since they're built from the same code.