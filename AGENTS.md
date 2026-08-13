# Project Guidelines

## Code changes

- Don't make any code changes unless requested. Knowledge is king.

## Commits and branches

- Don't commit unless requested.
- Don't create or switch branches unless explicitly requested.

## Translations

Any user-visible string passed to `translator.translate()` must have a corresponding entry in `frontend/src/assets/translations.json` for all three language sections: `ja`, `en`, and `tr`. Swedish is the fallback — no entry is needed there. Add new entries near thematically similar strings, not at the end of the section.

Strings wrapped with `noTranslate()` (imported from `frontend/src/i18n.ts`) are intentionally fixed in an unspecified language and must never be passed to `translator.translate()` or added to `translations.json`. The function is an identity marker — its purpose is to signal that translation is explicitly unwanted.

## README.md

When something worth mentioning in `README.md` has happened, such as new build steps, tech stack changes, or features, note it there. Also use it to understand how deployments are done.

## frontend/src/changelog.ts

Add a changelog entry before committing. This is user-facing, so make it less technical.

## Backend: rate limiting

Every backend HTTP endpoint in every service must be protected by a rate limiter. Use the `backend/shared/ratelimit` package (`IPRateLimiter`). No endpoint may be left unprotected. This is a hard requirement: the app runs on the developer's credit card.

# MALIN.md
This file contains additional instructions for the developer Malin Sigvardsson (and only her). She is a novice developer and need extra instructions.