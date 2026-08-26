# Project Guidelines

## Code changes

- Don't make any code changes unless requested. Knowledge is king.

## Commits and branches

- Don't commit unless requested.
- Don't create or switch branches unless explicitly requested.

## Translations

Any user-visible string passed to `translator.translate()` must have a corresponding entry in `frontend/src/assets/translations.json` for all three language sections: `ja`, `en`, and `tr`. Swedish is the fallback — no entry is needed there. Add new entries near thematically similar strings, not at the end of the section.

Strings wrapped with `noTranslate()` (imported from `frontend/src/i18n.ts`) are intentionally fixed in an unspecified language and must never be passed to `translator.translate()` or added to `translations.json`. The function is an identity marker — its purpose is to signal that translation is explicitly unwanted.

## Ids in the source data

Some entries in the source JSON carry an `id`, and where they do, that id is what the
user's synced document stores their progress against. It already exists on other
people's devices, so it is identity — not a label, not a position, and not a
description of the entry.

The rule is the same wherever an `id` appears:

- Never renumber, rename or reuse one, including after an entry is removed.
- A new entry takes an id that has never been used before.
- Correcting the display text beside an id — a romaji spelling, a translation — is
  always fine and deliberately leaves the id alone.

Changing one loses nothing visibly, which is what makes it dangerous: the progress
saved against the old id is orphaned, the entry comes back blank, and nothing reports
it. Each has a baseline file recording what has been handed out, and a test that fails
when one changes:

| Source | Stores | Baseline | Test |
| --- | --- | --- | --- |
| `word-list.json` | flashcard "known" flags | `word-list-id-baseline.json` | `word-list.test.ts` |
| `grading-exam-information.json` | ticked grading items | `grading-completion-id-baseline.json` | `grading-completions.test.ts` |
| `kamokuhyo.json` | notes and self-assessments | `kamokuhyo-id-baseline.json` | `kamokuhyo.test.ts` |

All paths are under `frontend/src/assets/`. Word list ids are numbers, so a new word
takes `max(id) + 1` wherever in the file it is inserted. Grading ids are strings that
were frozen from the romaji they used to be derived from, so a few read as `item-1`
where the item has no term; those are historical, not a pattern to follow.

A hokei moment's id is its `hokei_name`, except where a name covers more than one
moment — eleven of them do — and there it carries the variation that tells them apart,
in square brackets: `tsuki nuki [soto]`. The brackets are not a style choice. An
earlier version of the app wrote note keys in exactly that form, and there are notes
in production stored under them, so matching it is what keeps those notes attached to
their techniques.

**A new moment whose name is already taken needs the same treatment.**
`kamokuhyo.test.ts` fails on a duplicate id, which is what catches it — a name shared
by two moments would otherwise be a note shared by two techniques, silently.

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

## Organization and authorization

The app models Shorinji Kempo's structure: WSKO → national federations → branches. A member belongs
to exactly one branch, and a branch belongs to a federation **or** directly to WSKO — never both,
never neither. See `ORGANIZATION-PLAN.md` for the whole design and `BACKEND.md` for the as-built API.

**One function answers every organizational permission**: `authz.Covers(roles, scope, tree)` in
`backend/auth/internal/authz`. Seeing a user is authority over their branch; creating a branch is
authority over its federation; granting a role is authority over the scope that role confers — which
is why delegating downwards needs no rule of its own. Do not add a second place that decides who may
do what; extend the scope vocabulary instead.

One rule deliberately sits *beside* the covering test rather than inside it: `admin` and
`wsko_admin` both scope to the root, so granting or revoking `admin` additionally requires holding
it. It is a fact about that one role, not a new shape of authority.

**Organization names are never translated.** "Svenska Shorinji Kempoförbundet" is a proper noun: it
is stored once, in its own language, and displayed verbatim whatever language the reader is using.
Never pass one to `translator.translate()` and never add one to `translations.json`. The only
exception is the label **WSKO**, which is a constant in the frontend because WSKO is the root of the
tree rather than a stored record with a name of its own.

# MALIN.md
This file contains additional instructions for the developer Malin Sigvardsson (and only her). She is a novice developer and need extra instructions.