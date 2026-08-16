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
- [x] Stop putting a `/` in a Cosmos item id. Field items were stored as `field/<name>`,
  and `/` is one of the four characters Cosmos documents as illegal in `id` (with `\`,
  `?` and `#`). The earlier note here concluded that nothing was broken, because the Go
  SDK escapes the id for both the URL and the shared-key signature and batch operations
  carry it in the request body — "so every path this code uses works". That was wrong,
  and wrong in the way worth remembering: the delete path had never *run*. Every write
  until then only added or updated fields, so nothing had ever asked Cosmos to remove
  one. Retiring `syncProvider` from the synced document made the first removal, and
  because a transactional batch is rejected in full when any operation in it fails,
  every write for that user began returning 500. A probe against a real container
  settled it — `field/probe` accepts an upsert and refuses the delete; `field_probe`
  does both. Cosmos enforces the rule asymmetrically: it takes the write, then will not
  let go of it.
  It also broke account deletion, which batches a delete per field item, and had
  therefore been failing with a 500 for every split document since reads moved to this
  container. That went unnoticed for the same reason.
  Ids are `field_<name>` now, with the four illegal characters percent-escaped so a
  field name arriving from a client can no longer produce an id the store cannot
  manage. The scheme is recorded on the meta item, so a reader follows what was
  actually written rather than guessing; absent means the old scheme. A document
  migrates by being written, atomically — new items in, old ones emptied, same batch.
  Emptied rather than deleted, because deleting them is the thing Cosmos refuses.
  Upsert is still accepted for the same id, so the item is overwritten with a husk
  holding only id and partition key: the user's data goes, an unreachable shell stays.
  Expiring them would be tidier, but TTL cannot be enabled on a container with indexing
  off, and this one has indexing off precisely because every access is a point read.
  Neither environment kept a husk in the end. Both containers were rebuilt instead —
  reads flipped to `appdata`, container dropped and recreated, backfilled, reads
  flipped back — which is invisible to users because shadow-write failures are
  swallowed by design, and leaves nothing legacy behind at all. Production went from
  103 legacy items to 102 current ones, the single difference being the `syncProvider`
  field the new client had already retired for the one user who synced mid-window.
  Two things only the real service could catch, both of which would have shipped
  silently: TTL cannot coexist with indexing disabled, so the first design was
  impossible; and the first husk implementation did nothing at all, because
  `TransactionalBatch` is a value type whose methods append to a slice it holds, so
  passing one to a helper passed a copy and every operation added inside was discarded
  on return. The writes succeeded and the legacy items quietly kept their contents. The
  helper returns the husk for the caller to add now, so there is no batch to copy.
  Nothing caught the original because the file store used in tests keeps a user's items
  in one JSON file, where ids are map keys and never touch a path — worth knowing the
  next time a store behaviour looks well covered
- [ ] Add the granular per-item API, and only then split `notes` per note and bucket the entry-timestamped maps. That split needs the key formats, which live in the client, so it belongs there rather than in the server. This is also the step that bumps the schema version, and so the one gated on the client-build drain
- [x] Drop `syncProvider` from the synced set. It now lives in its own `sync/provider.ts` with a tiny external store, retired from `AppDataState` and added to `RETIRED_DATA_FIELDS` so it does not come back the first time an old device syncs. On first read it adopts whatever the stored document said, so the move signs nobody out. Two things it fixes beyond tidiness: it was circular (the document only exists on the server once signed in), and it was a merged scalar, so signing out on one device was a change the merge could raise a conflict prompt about on another
- [x] Decide what happens when the app-data document reaches its size cap. The 413 used
  to fall through to the generic error path — three retries of the same oversized body,
  each refused for the identical reason, then a parked "sync error" the user could do
  nothing with. It is its own terminal state now, next to the outdated-client one it
  resembles: neither is worth retrying, and the difference is that an outdated client
  is fixed by reloading while this one is fixed by nothing the app does on its own. The
  error carries the measured size and the limit. The toast says what has stopped and
  what has not — changes are still saved on this device, they are just not reaching the
  others — and deliberately offers no button, since nothing in the app makes the
  document smaller today
- [ ] Give the user a way to get back under the size cap. The reporting is done and
  the growth is now bounded; the remedy is still not. A note is capped at 2000
  characters (`HOKEI_NOTE_MAX_LENGTH`), applied in the textarea, in the editor's save
  and in `setHokeiNote` — the last of those being what catches a paste or a note
  synced from a build that had no cap. That was the one field a reader could grow
  without limit, so reaching the cap by ordinary use is no longer really possible: 288
  techniques at 2000 characters is about 660 KB of Latin text against a 1 MB
  `MaxBytesReader`.
  What remains is everything else — `hokeiRanks`, `knownFlashCards`,
  `weeklyPlanCompletions` and the two grading completion maps still accumulate inside
  the same blob — and, more to the point, a user who is *already* over has nothing to
  do about it but delete notes by hand. The real fix is still the granular per-item
  API above, waiting on the client-build drain
- [x] Stop hand-writing two divergent type views of `grading-exam-information.json`. One `grading-exam-information.ts` now owns the types and the import, and both components use it — the last two `as unknown as` casts in the frontend are gone. A complete draft-07 schema for the file already existed at `frontend/data/grading-exam-information.schema`, pointed at by the data's own `$schema` and enforced by nothing; a test now validates the data against it with ajv, so a transcription slip fails the suite with a path to the offending node instead of surfacing at runtime in whichever component happened to read it. Unifying the types exposed two ways the old ones were wrong: `Annotation.marker` was required though the schema makes it optional, and the file has a top-level `$schema` key, so `Partial<Record<GradeName, GradeManual>>` never described its shape
- [x] Give a flashcard's "known" flag a stable id. `knownFlashCards` was keyed by
  `entry.index + 1`, and `index` was a field stored in `word-list.json` that equalled
  the array position exactly, 0 through 537 — positional in everything but name, so
  inserting a word anywhere but the end and renumbering would move every later card's
  flag onto a different word. Worse than the orphaning the other derived keys suffer,
  because nothing goes missing: the flags stay, attached to the wrong words, and no
  screen shows anything unusual.
  It needed no migration in the end, which is the part worth remembering. Rather than
  replacing the key, the value it already had was frozen as identity: `index` became
  `id` holding `index + 1`, exactly what the flashcard key already used, so every key
  already stored on every device still named the word it always did. Nothing moved,
  so there was nothing to move.
  The rename is not what makes it stick — `word-list.test.ts` is, pinning each id to
  the word it has meant and failing when one changes meaning, disappears, or is reused
  from below the baseline. Proved by inserting a word mid-file and renumbering, and
  watching it name the first shifted id and count the 438 that followed.
  It also flushed out a bug in waiting: `word-lookup.ts` deduplicated compound-lookup
  matches by `entry.index`, so with the field gone every entry collapsed to one map
  key and `lookupWordEntries("gyaku gote")` returned only `gyaku`. Its own test caught
  it. Worth knowing how the type checker found the other three call sites: `tsc
  --noEmit` reports clean on the root tsconfig, which lists no files and only project
  references. `tsc -b` is the typecheck that sees this project
- [x] Key grading completions by something other than the displayed romaji. They were
  `${grade}|${item.term.romaji}`, falling back to `${grade}|item-${itemIndex}` where an
  item has no term, so correcting a spelling cleared every tick saved against the old
  one and reordering the term-less items moved ticks between them. How close that was:
  the `sashikae sokuō geri` → `sokutō` correction on 2026-08-16 landed on
  `techniques[].romaji`; one nesting level up, on `term.romaji`, and it would have
  cleared grading progress for every user with no error and no trace.
  Frozen in place like the word list: the 70 tickable items carry an `id` holding
  exactly what the key derived before — the romaji, or the historical `item-N` — so
  every stored key still names the item it always did, verified against HEAD rather
  than assumed. Unlike the hokei names there was no collision to resolve; all 70 keys
  were already unique.
  The two identical key functions became one that reads the id and returns `undefined`
  rather than a key when an item has none, so an item nothing can be stored against
  gets no checkbox instead of a `grade|undefined` key several items would share.
  `grading-completions.test.ts` pins the ids, checked by renaming one the old way and
  watching it name the six orphaned keys
- [ ] Give a note its own timestamp. `notes` is `Record<string, string>` — the only
  merged map whose entries carry no `updatedAt`, where `hokeiRanks`, `knownFlashCards`
  and the three completion maps all do. That absence is the whole reason a note
  disagreement has to be put to the user: `mergeMap` has no principled winner to pick,
  so `escalates: true` is the honest setting rather than a considered one. Stored as
  `{ text, updatedAt }` a note would settle itself like everything else, and the
  conflict prompt could be reserved for cases that genuinely need a person. The value
  shape changes, so this is a schema bump and belongs with the other one; reading
  either shape during the rollout keeps it from being a hard cutover
- [ ] Decide which of the synced fields are account data and which are device
  preferences. `theme`, `language`, `hokeiListSelection` and `showKanjiOnHokeiCards`
  describe how one device is set up, not what the user knows or has done, yet they
  ride in the same document and go through `mergeScalar` like `grade` and
  `kenshiNumber`. A genuine disagreement there sets `conflictDetected`, so two devices
  that were each given a different theme can raise the same conflict dialog as two
  devices disagreeing about the text of a note — and there is no right answer to offer,
  since both devices are correct about themselves. Worth noting alongside the
  `__conflictMarker` item above, which records that only notes and hokeiRanks raise the
  user-facing prompt: scalars raise it too, asserted by `merge.test.ts` for `grade` and
  `kenshiNumber`

## Correctness

- [x] Replace the `JSON.stringify` value comparison used as `areEqual`. It was key-order sensitive, so two devices that built the same `currentWeekAnchor` in different property order compared as different and the merge asked the user which device was right about two identical values. Now one `deepEqual` in `utilities/deep-equal.ts`, used by all three call sites. Deliberately narrow — everything it compares comes from `JSON.parse` or object literals of the same shape — and it keeps the old treatment of a key set to `undefined` as absent, which stored documents rely on
- [x] Remove the `gradePlans.find(...)!` non-null assertions. `findGradePlan` in `data.ts` falls back rather than asserting, so a grade that no longer exists renders something usable instead of crashing the whole app; Settings does nothing rather than passing on an undefined grade. The stored grade is left alone rather than silently corrected

## Structure

- [x] Collapse the four near-identical map merges in `sync/merge.ts` into one `mergeMap` taking a rules object: whether a disagreement escalates to the user, who wins one, and optional per-entry validation. The uneven behaviour that was buried in four functions is now stated once per field, next to why
- [x] Replace the `__conflictMarker` sentinel in `sync/merge.ts`, which signalled a conflict by writing a magic key into the notes/ranks maps themselves and deleting it after reading. Return the flag alongside the map instead. While there: document why only notes and hokeiRanks raise the user-facing conflict prompt, while flashcards and completions resolve silently — presumably deliberate, currently unwritten
- [ ] Break up `EmbuArea` in `FreePractice.tsx` (~285 lines, the largest component in the app). Best done as part of replacing the experimental embu builder rather than before it
- [ ] Audit the rest of the app for viewport lengths used inside the `zoom` wrapper.
  The whole app renders inside `<div style={{ zoom: textZoom }}>`, and `DefaultTextSize`
  is 1.1, so a viewport length in there paints about a tenth larger than the viewport it
  was measured against — this is the default case, not an edge one. It made a focused
  technique card taller than the screen with its scroll range below the fold, which is
  fixed, and `--app-zoom-inverse` now exists for converting back out. `App.css` had
  already worked this out once for the floating toast stack, in a comment, and the
  lesson did not travel. Known remaining instance: `.app-route-loading` uses `60vh` for
  a placeholder, which is harmless but is the same mistake. A grep for `vh|vw|dvh|dvw`
  across the stylesheets would find the rest. The guard in `HokeiCard.css.test.ts`
  covers only the focused card
- [x] Decide what to do with `backend/persistence/cmd/inspect`. It reported what is
  actually stored in the `userdata` container per user — id scheme, item counts,
  whether a value survives — which was the only way to see inside it while the ids were
  illegal and Data Explorer could not open them. That reason had gone away now the ids
  are legal. It was committed by accident rather than by decision, it was rough, and it
  needed a Cosmos key in the environment. Deleted rather than tidied into an admin
  command: nothing referenced it, its own header said "Temporary; deleted after use",
  and there is no current need for it. If the question comes back, the useful part is
  the query it settled — indexing is off on that container, so a scan needs
  `EnableScanInQuery`, and `value` is reserved in the Cosmos dialect and has to be
  reached as `c["value"]`
- [x] Remove the duplicate keys in `frontend/src/assets/translations.json`. `kōbōgi` and `ukemi` each appeared twice in all three language sections. Removed the repeat occurrences rather than the first ones: a duplicate key keeps its original position and only its value is overwritten, so dropping the first would have moved the key to the end and changed the parsed key order. The values were identical, so the parsed object is unchanged — verified by comparing before and after, and confirmed independently by the build producing an identical bundle hash. A test now reads the file as text and fails on any duplicate, since the parsed form is exactly where one disappears
- [x] Add tests for `weekly-copy.ts` — 23 covering every week type, the randori label, list joining per language and the basic-focus rules. Writing them found a real copy bug: the strikes-and-blocks rule matched `uke` unbounded, so `ukemi` matched it too and three of the 104 weeks with basic entries told the reader their grundarbete involved strikes when it was only falling. `uke` is bounded as a word now
- [x] Test the two state machines in `App.tsx`. They were untestable rather than
  untested: App imports `virtual:pwa-register/react`, which vite-plugin-pwa generates
  at build time and the vitest config knew nothing about, so importing App from a test
  failed to resolve before any assertion ran. That is aliased to an inert stub now, and
  `tsconfig.test.json` picks up the plugin's types the way the app project already did.
  The update hook moved to `app-update.ts` and training mode to `training-mode.ts`,
  18 tests between them. Writing the training-mode ones corrected an assumption rather
  than finding a bug: the hook resets on leaving the training area and does not stop
  the mode being switched on elsewhere — nothing needs it to, because App only renders
  the control where `getTrainingControlContext` says it belongs — so that boundary is
  written down as a test rather than left to read as a gap

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
- [x] Split `translations.json` by language. It was 120 KB gzipped of a 165 KB entry
  chunk. One file per language now: Japanese and English still load with the app, since
  both are reachable whatever the interface language is, and Turkish is fetched when
  Turkish turns out to be who is reading — 44 KB gzipped off the startup path for
  everyone else. First paint is 239 KB gzipped, against 382 before any of the splitting.
  The waiting happens in exactly one place: `main.tsx` reads the stored language and
  holds the first paint until that section is in hand, so a Turkish reader never
  watches the interface arrive in Swedish and change under them.
  `explicitTranslate` is gone as predicted. Its two callers wanted "the English name of
  this technique" and "what this language calls itself"; only the first is a
  translation, so `Translator` offers `english()` beside `japanese()` — exactly the two
  sections guaranteed to be loaded — and the second is a constant in Settings. The
  invariant is the type checker's now rather than a comment's.
  The split was textual, so every value kept its bytes and every key its position,
  verified per language against the parsed original before writing. The
  `translations:export`/`import` commands are unchanged; only the file they touch
  moved, and both scripts got simpler for no longer indexing into a language
- [x] Decide what a failed chunk load should do. Lazy routes made it possible for the
  first time: a build deployed while someone has the app open, before the service
  worker has precached the new chunks, and the import 404s. It used to land in the root
  `ErrorBoundary` and replace the whole app. Caught per route now, in
  `components/RouteContent.tsx`, so the navbar survives and the user can go somewhere
  that did load; the boundary is keyed on the path so navigating away clears it rather
  than holding the error for the rest of the session
- [x] Work out what the UI does while a chunk is in flight. React Router runs a
  navigation as a transition, so React keeps the current page on screen instead of
  showing the Suspense fallback. An earlier note here said the navbar and training
  controls moved on to the page that had been asked for while the body lagged; a probe
  test disproved that. React holds back the **whole** commit — mid-navigation
  `useLocation()` still reports the old path and the clicked link is still unstyled —
  so there is no half-drawn state at all. What there is instead is a tap that changes
  nothing whatsoever, which is a cleaner problem and a worse-looking one. Pages are
  fetched once the app goes idle now, which closes the window for every way of
  navigating at once and costs no extra traffic, since the service worker precaches
  them moments later regardless. The Suspense fallback is still what a cold deep link
  sees, having no previous page to hold
- [x] Give a slow navigation something to say for itself. A thin bar at the top of the
  page, after a 200 ms delay so a chunk already in hand never flashes one. The delay is
  the part worth testing, and the first version of that test was worthless — it used a
  route that resolved synchronously, so it passed with the delay removed. It drives a
  deliberately brisk arrival now and fails without it.
  Detecting the wait at all needs the click, not the router: everything on screen is
  still rendering the previous location, so nothing already rendered can notice. The
  handler records the intent in `navigation-pending.ts`, outside React's transition, so
  that update commits immediately while the navigation it belongs to does not. Wired at
  the two places navigation starts — the navbar links, and `Grid`, which every card
  landing page goes through
