# Technical debt

Architectural findings from the code review on 2026-08-15. Ordinary feature work and
open design questions live in `TODO.md`; this file is only for structural weaknesses in
code that already works.

The list is ordered by risk, not by effort.

## Data loss

- [x] Give the synced document optimistic concurrency. `syncNow()` downloaded, merged and uploaded with nothing guarding the gap, so a device writing between another device's GET and PUT had its write overwritten silently. GET now returns the store's ETag, PUT carries it as `If-Match` (or `If-None-Match: *` when creating the first document) and answers 412 when the belief no longer holds, and the client re-reads and re-merges up to three times before giving up. Requests with no precondition keep the old last-write-wins behaviour, so app versions cached by a service worker do not lose the ability to sync
- [x] Make `syncNow()` re-entrant-safe. The four things that can ask for a sync — the 2.5 s scheduled pass, the `visibilitychange` handler, the retry timer and the user's "Försök nu" button — now join an in-flight run instead of starting a competing one, and a request that arrives mid-run schedules another pass afterwards so changes made during a sync are not stranded

## Data model

- [x] Stop older builds deleting fields they do not recognise. `sanitizeDocument` rebuilt `data` from a fixed list of known keys and dropped everything else, and the merge did the same, so any build that predated a new field would strip it and sync the stripped document back — erasing it for every one of the user's devices. Both now carry unknown fields through untouched, minus a `RETIRED_DATA_FIELDS` list for fields deliberately removed from the document (`embuDraft`). Alongside it, clients declare two separate things — the shape they write (`X-App-Schema-Version`) and the highest shape they can hold without dropping anything (`X-App-Schema-Compat`) — and the server refuses a write whose compatibility is below the stored document's schema, with a 409 the client recognises. Server-side is the only place this can be enforced, because the dangerous builds are the ones already installed. Keeping the two numbers apart is what lets a build that writes an older shape but preserves what it cannot read keep syncing through a rollout it predates, instead of being locked out for not being newest. Both declarations are recorded on the document so the spread of client builds can be counted, and a write from below the current compatibility is logged. The gate is dormant until a release actually writes a newer shape
- [x] Start filling a split-item store alongside the old one. New Cosmos container `userdata` keyed `/userId` (the old one is keyed `/id` and Cosmos cannot repartition in place, so the old container stays untouched as the rollback). Every accepted document is also written split into one item per top-level field, in a single transactional batch — which is what sharing a partition key buys. Failures are logged and swallowed: nothing reads the new store yet, so a fault there must not be able to take syncing down. The split is structural rather than field-aware on purpose; teaching the Go side every schema change the client makes would drift the first time that slipped, and a structural split carries fields nobody has invented yet for free
- [x] Backfill `userdata` for users who have not signed in since shadow writes started. `POST /api/v1/admin/userdata-backfill`, admin-guarded and registered only while shadow writes are on. Enumerating the old container needs `EnableScanInQuery`, since indexing is disabled there — deliberately a requested operation rather than something that runs at startup. Idempotent by `updatedAt`, so re-running after a failure costs reads not rewrites, and a user that fails is counted and passed over rather than abandoning the run
- [x] Run the backfill against staging and production. Staging 4 total / 3 copied / 1 already current / 0 failed; production 8 / 7 / 1 / 0, on 2026-08-15. Both containers are now complete. Worth more than the totals: a non-zero `total` proves `EnableScanInQuery` enumerates a container with indexing disabled — the one path the file-store tests could not cover — and `failed: 0` means the split handled every real document at real shape
- [x] Re-run the backfill after deploying the batch. Staging 4/0/4/0 and production 8/0/8/0 (total/copied/alreadyCurrent/failed) on 2026-08-15. `copied: 0` is the result worth recording: every shadow write since the first backfill landed, so the write path being promoted to primary has dropped nothing across a full day of real use. The read-through healing added with the flip also means the gap between a backfill and the flip is no longer a correctness risk, only a tidiness one
- [x] Give the split store its own optimistic concurrency before any read is served from it. Done without a composite hash in the end: every write rewrites the meta item, so its ETag identifies the document as a whole, and because Cosmos rejects a whole batch when any operation in it fails, an `If-Match` on that one item guards everything written with it. `Save` is the checked write; `SaveUnconditional` is for shadow writes and the backfill, which copy a write the old store already ordered
- [x] Flip reads to the split store behind a config flag (`USERDATA_READS`, default off), keeping dual-write so rollback is a restart rather than a deploy. Built as a swap rather than a second code path: both stores satisfy one `documentStore` interface, so the flag only decides which is `primary` (read from, preconditions checked against) and which is `shadow` (written a copy). A document found only in the shadow is copied across and served rather than 404'd — healing, not just falling back, because the ETag handed out has to come from the store that will check the next write. The backfill refuses to run once the flag is on, since its one direction would then overwrite current data with the rollback copy
- [x] Turn `USERDATA_READS` on in both environments. Wired through `persistence-app.bicep` as a module parameter so each environment sets it independently, and rendered as an explicit `true`/`false` string rather than `string(bool)`, which produces `True` and would be rejected by Go's `strconv.ParseBool` — leaving the flag silently off. The split-item container is now the source of truth; the original keeps receiving every write, so the way back is setting this false and redeploying
- [ ] Add the granular per-item API, and only then split `notes` per note and bucket the entry-timestamped maps. That split needs the key formats, which live in the client, so it belongs there rather than in the server. This is also the step that bumps the schema version, and so the one gated on the client-build drain
- [x] Drop `syncProvider` from the synced set. It now lives in its own `sync/provider.ts` with a tiny external store, retired from `AppDataState` and added to `RETIRED_DATA_FIELDS` so it does not come back the first time an old device syncs. On first read it adopts whatever the stored document said, so the move signs nobody out. Two things it fixes beyond tidiness: it was circular (the document only exists on the server once signed in), and it was a merged scalar, so signing out on one device was a change the merge could raise a conflict prompt about on another
- [ ] Decide what happens when the app-data document reaches its size cap. `notes`, `hokeiRanks`, `knownFlashCards`, `weeklyPlanCompletions`, `gradingFundamentalCompletions` and `gradingTheoryCompletions` all grow without bound inside one blob, and the PUT is capped at 1 MB (`MaxBytesReader` in `backend/persistence/internal/api/handlers.go`, because Cosmos hard-limits items to 2 MB). Nothing prunes and nothing warns; a 413 would surface as a generic sync error that retries three times and then parks in a state the user cannot act on. Belongs with the permanent Embu data-model work in `TODO.md`
- [x] Stop hand-writing two divergent type views of `grading-exam-information.json`. One `grading-exam-information.ts` now owns the types and the import, and both components use it — the last two `as unknown as` casts in the frontend are gone. A complete draft-07 schema for the file already existed at `frontend/data/grading-exam-information.schema`, pointed at by the data's own `$schema` and enforced by nothing; a test now validates the data against it with ajv, so a transcription slip fails the suite with a path to the offending node instead of surfacing at runtime in whichever component happened to read it. Unifying the types exposed two ways the old ones were wrong: `Annotation.marker` was required though the schema makes it optional, and the file has a top-level `$schema` key, so `Partial<Record<GradeName, GradeManual>>` never described its shape

## Correctness

- [x] Replace the `JSON.stringify` value comparison used as `areEqual`. It was key-order sensitive, so two devices that built the same `currentWeekAnchor` in different property order compared as different and the merge asked the user which device was right about two identical values. Now one `deepEqual` in `utilities/deep-equal.ts`, used by all three call sites. Deliberately narrow — everything it compares comes from `JSON.parse` or object literals of the same shape — and it keeps the old treatment of a key set to `undefined` as absent, which stored documents rely on
- [x] Remove the `gradePlans.find(...)!` non-null assertions. `findGradePlan` in `data.ts` falls back rather than asserting, so a grade that no longer exists renders something usable instead of crashing the whole app; Settings does nothing rather than passing on an undefined grade. The stored grade is left alone rather than silently corrected

## Structure

- [x] Collapse the four near-identical map merges in `sync/merge.ts` into one `mergeMap` taking a rules object: whether a disagreement escalates to the user, who wins one, and optional per-entry validation. The uneven behaviour that was buried in four functions is now stated once per field, next to why
- [x] Replace the `__conflictMarker` sentinel in `sync/merge.ts`, which signalled a conflict by writing a magic key into the notes/ranks maps themselves and deleting it after reading. Return the flag alongside the map instead. While there: document why only notes and hokeiRanks raise the user-facing conflict prompt, while flashcards and completions resolve silently — presumably deliberate, currently unwritten
- [ ] Break up `EmbuArea` in `FreePractice.tsx` (~285 lines, the largest component in the app). Best done as part of replacing the experimental embu builder rather than before it
- [x] Remove the duplicate keys in `frontend/src/assets/translations.json`. `kōbōgi` and `ukemi` each appeared twice in all three language sections. Removed the repeat occurrences rather than the first ones: a duplicate key keeps its original position and only its value is overwritten, so dropping the first would have moved the key to the end and changed the parsed key order. The values were identical, so the parsed object is unchanged — verified by comparing before and after, and confirmed independently by the build producing an identical bundle hash. A test now reads the file as text and fails on any duplicate, since the parsed form is exactly where one disappears
- [x] Add tests for `weekly-copy.ts` — 23 covering every week type, the randori label, list joining per language and the basic-focus rules. Writing them found a real copy bug: the strikes-and-blocks rule matched `uke` unbounded, so `ukemi` matched it too and three of the 104 weeks with basic entries told the reader their grundarbete involved strikes when it was only falling. `uke` is bounded as a word now. Tests for the training-mode and update-toast state machines in `App.tsx` are still open

## Delivery

- [x] Split the frontend bundle. It was a single 1.37 MB chunk (382 KB gzipped) with no
  code splitting. What the first paint now needs is 276 KB gzipped, down 28%, in two
  parallel chunks: the app (165 KB) and a `vendor` chunk holding React and the UI
  libraries (112 KB). Four separate things got it there, and the last three mattered
  more than the route split did:
  - Every page but the start screen is a `lazy()` chunk behind one `Suspense`. This is
    also what moved `grading-exam-information.json` out, since only the grading page
    reads it
  - `TheoryToolPage` and `TrainingToolPage` moved to `components/ToolPage.tsx`. They are
    the frame the tools render inside, so importing them eagerly pulled `Training.tsx`
    in with them — and behind it `Kamoku` and `FreePractice`, the largest components in
    the app. The two were near-identical, so the move deduplicated them and their CSS
  - The changelog entries (28 KB gzipped, the whole release history in four languages)
    moved to `changelog-entries.ts`, fetched after mount. `changelog.ts` keeps only the
    types and the seen marker. The toast now appears a beat after the page instead of
    with it, which is the right order for a notice nobody came here for
  - The word list (17 KB gzipped) is fetched when this device first touches something,
    and warmed at idle after mount. The long-press handler stays synchronous against
    the loaded module rather than awaiting inside the gesture: a handler that awaits
    sets its "this press opened a lookup" flag after the finger has already lifted, and
    the tap it exists to swallow reaches the card underneath. An existing test caught
    exactly that
  CSS is deliberately left in one file (`cssCodeSplit: false`) so a lazily-loaded page
  can never paint before its own stylesheet lands; the built stylesheet was compared
  rule by rule against the old one to prove the ToolPage move changed nothing but the
  two merged selectors. The service worker still precaches every chunk, so offline use
  and repeat visits are unchanged — and a returning user after a release now refetches
  only the app chunk, 165 KB rather than 382 KB
- [ ] Split `translations.json` by language. It is what remains of the entry chunk:
  120 KB gzipped of the app's 165 KB. Japanese is needed everywhere (kanji sit next to
  every technique name) and English nearly so (the dojo card headers ask for it by
  name), but Turkish — 42 KB gzipped, a quarter of the entry chunk — is dead weight for
  every user who is not Turkish. Held back because it is a change to the authored file
  layout, which the `translations:export`/`import` workflow is built around: it needs
  either one file per language, or a build step that slices the one file. Note also
  that `explicitTranslate` would have to narrow — its two callers want "the English
  name" and "this language's own name", and the second of those is not really a
  translation at all
- [ ] Decide what a failed chunk load should do. Lazy routes make it possible for the
  first time: a build deployed while someone has the app open, before the service
  worker has precached the new chunks, and the import 404s. It lands in the root
  `ErrorBoundary`, which offers a reload in four languages and does fix it — but it
  replaces the whole app for what is really one page failing to arrive
