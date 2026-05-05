# Shorinji Kempo Study App

A Progressive Web App (PWA) for Shorinji Kempo practitioners to study techniques, terminology, and grade curricula. Built with React 19, TypeScript, and Vite.

## Features

- **Kamoku** — weekly training schedule by grade, with techniques and forms organized per session
- **All Hokei** — browse and filter all techniques across all grades
- **Technique Groups** — explore techniques organized by category
- **Word List** — searchable dictionary of kanji, romaji, and technique terminology
- **Quiz** — rapid-fire questions testing technique names and terminology
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

Required repository secrets: `SSH_HOST` (`hostname:port`), `SSH_USER`, `SSH_PRIVATE_KEY`.
