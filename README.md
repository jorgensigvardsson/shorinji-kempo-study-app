# Shorinji Kempo Study App

A Progressive Web App (PWA) for Shorinji Kempo practitioners to study techniques, terminology, and grade curricula. Built with React 19, TypeScript, and Vite.

## Features

- **Training** — choose between a grade-based weekly plan and free practice, with app-style back navigation that preserves your place
- **Contextual training tools** — a discreet global grade selector and a Training mode that combines the focused Dojo presentation with keeping the screen awake
- **Weekly progress** — mark a training week as completed and retain its completion date across synced devices
- **Free practice** — focused areas for Kihon, Hokei, Tan'en/Sōtai, Randori, and Embu/Kumi-embu
- **Experimental Embu builder** — assemble an Embu from existing techniques with transitions and notes; drafts are intentionally local-only while the permanent data model is designed
- **Technique Groups** — explore techniques organized by category under Theory
- **Grading** — theoretical requirements under Theory and practical requirements under Training, without duplicating the source material
- **Theory** — a shared entrance for technique groups, grading information, the word list, quiz, and flashcards
- **Word List** — searchable dictionary of kanji, romaji, and technique terminology, with compact in-place lookup from selected or long-pressed text
- **Quiz** — rapid-fire questions testing technique names and terminology, with streak counter and synced all-time high score
- **Flashcards** — spaced-repetition learning tool (non-Japanese languages)
- **Focused technique cards** — calm full-card practice view, Dojo mode, notes, videos, and self-assessment
- **Accounts** — sign in with an email code (or Google/Microsoft, when the address belongs to one); an account is required to use the app, and study data syncs automatically to the backend across devices
- **Push notifications** — opt-in Web Push (e.g. new-version announcements) delivered even when the app is closed
- **In-app feedback** — send feedback straight from the menu; the backend emails it to the maintainer, no mail client required
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

The app requires an account, so the dev server alone stops at the login screen — the auth
service must be reachable on `localhost:8081` before you can get in. Bring the backend up
from the repository root:

```bash
docker compose up                      # frontend + auth + persistence
docker compose up auth persistence     # backends only, alongside your own `npm run dev`
```

Compose reads Google/Microsoft OIDC credentials from a `.env` file in the repository root
(`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`);
without them those providers stay disabled and every address falls back to an emailed code.
With no SMTP relay configured the auth service logs the code to stdout instead of sending it.
Pointing the dev server at the staging or production backend instead is not an option: their
CORS allowed origin is an exact match against `FRONTEND_URL`, so `localhost:5173` is rejected.

### Experimental font picker

Active with `VITE_DEBUG=true` locally, or automatically on staging (`VITE_ENVIRONMENT=staging`)
so it can be tried without a local build — see `isFontPickerEnabled` in
`frontend/src/google-fonts.ts`, the single flag every integration point checks. It never
activates in production. When active, two font pickers appear in the floating toolbar
(bottom-left, normally only shown on grading/training-mode pages) — one for body text, one
for headings, changed independently — that swap the app's fonts live, per-device — useful for
trying candidates without a rebuild. Each filters a bundled snapshot of Google Fonts metadata
(`frontend/src/assets/google-fonts.json`) by name, category, and language, the same way
fonts.google.com's own filters work, and loads the chosen font from Google Fonts' key-free CSS
endpoint. The choices are stored in plain `localStorage`, not synced to the backend.

The snapshot is static and only needs regenerating occasionally (font families rarely
change). To refresh it:

```bash
GOOGLE_FONTS_API_KEY=<key> npm run fonts:fetch   # from frontend/
```

Get a free key from [Google Cloud Console](https://console.cloud.google.com) (enable the
Fonts Developer API). The key is only used locally to regenerate the JSON file — it's never
written to disk, committed, or shipped in the app; loading a chosen font at runtime uses
Google's public, key-free stylesheet endpoint.

**This is temporary** — once one font is chosen, delete it:
- Delete `frontend/src/google-fonts.ts` (+ `.test.ts`), `frontend/src/components/FontPicker.tsx`
  (+ `.test.tsx`), `frontend/src/persistence/font-family.ts`,
  `frontend/src/assets/google-fonts.json`, and `frontend/scripts/fetch-google-fonts.ts`.
- Remove the `fonts:fetch` line from `frontend/package.json` scripts.
- In `frontend/src/components/TrainingControls.tsx`/`.css`: remove the `bodyFontPicker`/
  `headingFontPicker` props, the `FontPicker` import, the `{bodyFontPicker && (...)}`/
  `{headingFontPicker && (...)}` blocks, and the `.training-controls-font`/`.font-picker*`
  CSS rules.
- In `frontend/src/App.tsx`: remove the `bodyFontFamilyData`/`headingFontFamilyData` props,
  state, and effects, the `bodyFontFilter`/`headingFontFilter` state, the
  `applyFontFamily`/`isFontPickerEnabled` import and usage, and drop `isFontPickerEnabled`
  from the `--training-controls-reserve` calculation.
- In `frontend/src/main.tsx`: remove the `bodyFontFamilyData`/`headingFontFamilyData` loads
  and props.
- Delete this README section.
- Hardcode the chosen fonts: set `$font-family-base`/`$font-family-sans-serif` (body) and
  `--app-display-font` (headings) in `frontend/src/styles/bootstrap-theme.scss`/`index.css`
  (or add an `@font-face`/Google Fonts `<link>` if either is a web font) rather than relying
  on any of the above.

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
- The persistence service (`backend/persistence`) serves `GET /push/public-key`, stores subscriptions via `POST /push/subscribe` / `POST /push/unsubscribe`, and broadcasts via `POST /push/broadcast`. Subscribing requires a signed-in session, so every subscription is tied to a user; unsubscribing does not, so a device can always drop its own endpoint. Dead subscriptions (HTTP 404/410) are pruned automatically.
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

Required repository variables (these are *variables*, not secrets — they are not sensitive, and leaving them unmasked keeps deploy logs readable):
- `SSH_HOST` (`hostname:port`, e.g. `prime4.inleed.net:2020`), `SSH_USER` — deploy target. The port is mandatory; the workflow splits the value on the colon and there is no default.
- `FRONTEND_URL` — the production origin, no trailing slash. Becomes the backend's CORS allowed origin, which is compared to the browser's `Origin` header by exact string match.
- `VITE_AUTH_URL`, `VITE_API_URL` — backend service origins, no trailing slash. A trailing slash produces doubled slashes in request paths, which Go's `ServeMux` answers with a 301 — fatal for CORS preflight.

Optional repository variables (with sensible defaults):
- `VAPID_PUBLIC_KEY` — Web Push VAPID public key; `VAPID_SUBJECT` — `mailto:` or site URL for the VAPID claim. Push endpoints stay disabled until the public/private key pair is set.
- `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_FROM` — mail relay for email (code) sign-in, paired with the `SMTP_PASSWORD` secret. `SMTP_FROM` may carry a display name: `Shorinji Kempo <noreply@example.com>`. With `SMTP_HOST` or `SMTP_FROM` unset the auth service logs codes to stdout instead of sending them.
- `SMTP_PORT` (default `587`) and `SMTP_TLS` (default `starttls`) — use `465`/`implicit` for SMTPS. `starttls` refuses to deliver over an unencrypted connection rather than falling back to one.
- `FEEDBACK_EMAIL` — comma-separated recipient(s) for in-app feedback submissions (`POST /auth/feedback`, sent via the same SMTP relay); leave unset to disable the feedback form
- `VITE_DEBUG` (default `false`)

`VITE_APP_VERSION` is not something you set — the workflow writes it automatically as the deployed commit SHA (the same one used to tag the backend images), so it's not listed above. It's included with feedback submissions purely as triage context.

## Deployment staging
Deployments may be done to the staging environment. Same rules apply for the staging environment as for the production environment. The differences: push to the branch `deploy-staging`, and the site syncs to `~/domains/app-staging.shorinjikempo.net/public_html` on the same host.

Staging also deploys its own auth and persistence services, into a separate Azure resource group, so backend sign-in and sync can be tested there too. It shares prod's Cosmos DB account rather than provisioning a second one — see [BACKEND.md](BACKEND.md#staging) for the full setup, including the one-time Azure configuration it doesn't automate.

The staging build sets `VITE_ENVIRONMENT=staging`, which shows a small "Staging environment" label fixed to the bottom-left corner of every screen — a quick visual cue that staging and prod would otherwise not have, since they're built from the same code.
