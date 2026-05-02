# Project Guidelines

## Translations

Any user-visible string passed to `translator.translate()` must have a corresponding entry in `src/assets/translations.json` for all three language sections: `ja`, `en`, and `tr`. Swedish is the fallback — no entry needed there. Add new entries near thematically similar strings, not at the end of the section.

Strings wrapped with `noTranslate()` (imported from `src/i18n.ts`) are intentionally fixed in an unspecified language and must never be passed to `translator.translate()` or added to `translations.json`. The function is an identity marker — its purpose is to signal that translation is explicitly unwanted.
