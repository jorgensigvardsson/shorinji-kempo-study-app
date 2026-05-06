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
- **Multilingual** — Swedish (default/fallback), English, Turkish, Japanese

## Tech stack

- React 19 + TypeScript + Vite
- React Router 7
- Bootstrap 5
- Vitest + Testing Library
- PWA with service worker for offline use

## Development

```bash
npm install
npm run dev       # start dev server
npm test          # run tests
npm run build     # production build
```

## Deployment

Pushes to the `deploy` branch trigger the GitHub Actions workflow, which builds a Docker image and deploys it to the production host via SSH. See [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) for details.

The workflow writes `.env.production` from repository secrets/vars before building, since `.env.*` files are gitignored.

Required repository secrets:
- `SSH_HOST` (`hostname:port`), `SSH_USER`, `SSH_PRIVATE_KEY` — deploy target
- `VITE_FEEDBACK_EMAIL` — comma-separated feedback recipient(s)
- `VITE_ONEDRIVE_CLIENT_ID` — OneDrive OAuth public client ID
- `VITE_GOOGLE_CLIENT_ID` — Google Drive OAuth public client ID

Optional repository variables (with sensible defaults):
- `VITE_DEBUG` (default `false`)
- `VITE_ONEDRIVE_TENANT_ID` (default `consumers`)
- `VITE_ONEDRIVE_REDIRECT_URI`, `VITE_GOOGLE_REDIRECT_URI` — only set if the redirect URI differs from `<origin>/`

## Deployment staging
Deployments may be done to the staging environment. Same rules apply for the staging environment as for the production environment. The only thing that differs is that one must push to the branch `deploy-staging`.