# Technical debt

Architectural findings from the code review on 2026-08-15. Ordinary feature work and
open design questions live in `TODO.md`; this file is only for structural weaknesses in
code that already works.

The list is ordered by risk, not by effort.

## Data loss

- [x] Give the synced document optimistic concurrency. `syncNow()` downloaded, merged and uploaded with nothing guarding the gap, so a device writing between another device's GET and PUT had its write overwritten silently. GET now returns the store's ETag, PUT carries it as `If-Match` (or `If-None-Match: *` when creating the first document) and answers 412 when the belief no longer holds, and the client re-reads and re-merges up to three times before giving up. Requests with no precondition keep the old last-write-wins behaviour, so app versions cached by a service worker do not lose the ability to sync
- [x] Make `syncNow()` re-entrant-safe. The four things that can ask for a sync — the 2.5 s scheduled pass, the `visibilitychange` handler, the retry timer and the user's "Försök nu" button — now join an in-flight run instead of starting a competing one, and a request that arrives mid-run schedules another pass afterwards so changes made during a sync are not stranded

## Data model

- [ ] Decide what happens when the app-data document reaches its size cap. `notes`, `hokeiRanks`, `knownFlashCards`, `weeklyPlanCompletions`, `gradingFundamentalCompletions` and `gradingTheoryCompletions` all grow without bound inside one blob, and the PUT is capped at 1 MB (`MaxBytesReader` in `backend/persistence/internal/api/handlers.go`, because Cosmos hard-limits items to 2 MB). Nothing prunes and nothing warns; a 413 would surface as a generic sync error that retries three times and then parks in a state the user cannot act on. Belongs with the permanent Embu data-model work in `TODO.md`
- [ ] Stop hand-writing two divergent type views of `grading-exam-information.json`. `FreePractice.tsx` casts it to `GradingManual` and `GradingTest.tsx` casts the same file to a different `GradeManual`, both through `as unknown as` — the only type-safety escape hatches left in the frontend, sitting over the most frequently edited data file in the project. Generate the type from the data, or validate the file against a schema at build time, so a change to the JSON fails the build instead of failing at runtime in one component

## Correctness

- [ ] Replace the `JSON.stringify` value comparison used as `areEqual` in `sync/merge.ts`, `persistence/store.ts` and `sync/manager.ts`. It is key-order sensitive, so two devices that constructed the same `currentWeekAnchor` in different property order compare as different and raise a spurious conflict prompt — rare, confusing, and hard to reproduce
- [ ] Remove the `gradePlans.find(...)!` non-null assertions in `App.tsx` (twice), `FreePractice.tsx` and `Settings.tsx`. A `grade` value arriving over sync that is not in the current data crashes the entire app at render rather than degrading one page. Only reachable if a grade is ever renamed or removed, but sync means an old device can hand us one

## Structure

- [ ] Collapse the four near-identical map merges in `sync/merge.ts` — `mergeNotes`, `mergeHokeiRanks`, `mergeKnownFlashCards` and `mergeCompletionRecords` are the same three-way key-union walk differing only in equality and tiebreak, roughly 130 lines that could be one generic taking those two functions
- [ ] Replace the `__conflictMarker` sentinel in `sync/merge.ts`, which signals a conflict by writing a magic key into the notes/ranks maps themselves and deleting it after reading. Return the flag alongside the map instead. While there: document why only notes and hokeiRanks raise the user-facing conflict prompt, while flashcards and completions resolve silently — presumably deliberate, currently unwritten
- [ ] Break up `EmbuArea` in `FreePractice.tsx` (~285 lines, the largest component in the app). Best done as part of replacing the experimental embu builder rather than before it
- [ ] Add tests for `weekly-copy.ts` — content-generation logic feeding the weekly plan, currently untested — and for the training-mode and update-toast state machines in `App.tsx`

## Delivery

- [ ] Split the frontend bundle. The production build is a single 1.37 MB chunk (381 KB gzipped) with no code splitting, of which roughly 950 KB is statically imported JSON — `translations.json` alone is 446 KB. The service worker precaches 2 MB, so repeat visits are fine, but first load on a phone in a dojo is not
