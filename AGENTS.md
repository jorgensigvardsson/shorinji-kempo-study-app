# Project Guidelines

## Code changes

- Don't make any code changes unless requested. Knowledge is king.

## Commits and branches

- Don't commit unless requested.
- Don't create or switch branches unless explicitly requested.

## Translations

Any user-visible string passed to `translator.translate()` must have a corresponding entry in `frontend/src/assets/translations.json` for all three language sections: `ja`, `en`, and `tr`. Swedish is the fallback — no entry is needed there. Add new entries near thematically similar strings, not at the end of the section.

Strings wrapped with `noTranslate()` (imported from `frontend/src/i18n.ts`) are intentionally fixed in an unspecified language and must never be passed to `translator.translate()` or added to `translations.json`. The function is an identity marker — its purpose is to signal that translation is explicitly unwanted.

## Word list ids

Each entry in `frontend/src/assets/word-list.json` carries an `id`, and that id is
identity rather than position. A flashcard's "known" flag is saved against it in the
user's synced document, so the number already exists on other people's devices.

- A new word takes `max(id) + 1`, wherever in the file it is inserted.
- An id is never renumbered and never reused, including after a word is removed.
- Correcting a word's spelling in place is fine — the id stays, and
  `frontend/src/assets/word-list-id-baseline.json` is updated to match.

Renumbering loses nothing visibly: it moves every later flag onto a different word,
so the app reports that people know words they have never seen.
`frontend/src/assets/word-list.test.ts` fails when an id changes meaning.

## Fonts: kanji, hiragana and katakana

Japanese text carries its own font, separate from the body and heading fonts. Nothing marks it up as Japanese — no class, no `<span>`, no script detection. It works purely through the order of the font stack: the Latin faces come first, the Japanese faces sit behind them, and the browser falls through per character for anything the Latin faces cannot draw. Japanese mixed into a Latin sentence is handled by the same mechanism, mid-word.

So writing Japanese text needs no special treatment at all — but **declaring `font-family` does**:

- Use the composed stacks: `var(--bs-body-font-family)` for body text, `var(--app-display-font)` for headings. Both already carry the Japanese layer.
- Never hand-roll a stack in a CSS rule (`font-family: Georgia, serif`). Any element styled that way loses the kanji font silently — Latin looks right, so it is easy to miss.
- Never put a generic keyword (`serif`, `sans-serif`) in front of the Japanese layer. A generic resolves to the OS default face, which on a CJK-capable system draws the kanji itself and cuts off everything listed after it. The generic belongs at the very end.

To add another Latin face to a stack, extend `--app-body-face`/`--app-display-face` in `frontend/src/index.css` rather than the composed variables. The layers, and which of them the experimental font picker overrides, are documented at the top of that file.

## README.md

When something worth mentioning in `README.md` has happened, such as new build steps, tech stack changes, or features, note it there. Also use it to understand how deployments are done.

## frontend/src/changelog.ts

Add a changelog entry before committing. This is user-facing, so make it less technical.

## Backend: rate limiting

Every backend HTTP endpoint in every service must be protected by a rate limiter. Use the `backend/shared/ratelimit` package (`IPRateLimiter`). No endpoint may be left unprotected. This is a hard requirement: the app runs on the developer's credit card.

# MALIN.md
This file contains additional instructions for the developer Malin Sigvardsson (and only her). She is a novice developer and need extra instructions.