# Todo

Ideas and follow-up tasks to park without interrupting the current task.
Structural weaknesses in code that already works live in `TODO-TechnicalDebt.md`.

- [ ] Add comments for repetition-and other cards
- [ ] Review the merged Training page on mobile and desktop
- [ ] Consider a clearer navigation name than "Kamoku" for new users
- [ ] Review other crowded pages one at a time and reduce unnecessary card styling
- [ ] Check that the merged Training page preserves all existing notes, ratings, filters, and links
- [ ] Use bilingual Training labels: localized explanation first, with "Kamoku" and "All hokei" retained as Japanese terminology
- [ ] Replace All hokei phone filters with a mobile-friendly filter panel
- [ ] Apply the calmer full-card layout to the All hokei section after comparing it in Kamoku
- [ ] Allow users to fill in missing stance/action fields as personal overrides without modifying the canonical Kamokuhyo source data; include editing, clearing, persistence/sync, and a clear distinction between source content and personal additions
- [ ] Collaboratively define calmer Shorinji Kempo theme colors and fonts before applying them across the app
- [ ] Once a font is settled on (see the experimental font picker, VITE_DEBUG/staging only), remove it and hardcode the choice — full removal checklist in README.md's "Experimental font picker" section
- [ ] Add an optional preferred name in Settings and store it in the synced backend app data; let the user edit or clear it, use it only for the start-page greeting `Gasshō, {name}`, and retain plain `Gasshō` when no name is set
- [ ] Audit the app's global text-zoom layout on narrow screens; the current whole-page zoom can push the right edge of controls and cards beyond the viewport, including the Dojo-mode control in the weekly plan
- [ ] Add an option to show all techniques up to the user’s next grade, while keeping the focused weekly-plan view
- [ ] Find a clear home in the future Study/Train structure for the existing tan’en and sōtai techniques and videos
- [ ] Ask Sensei whether `sashikae sokuō geri` in the grading material is a misspelling of `sashikae sokutō geri`; keep the two source spellings unchanged and separate until this has been confirmed
- [ ] Review the proposed Free practice → Kihon lists with Sensei: starting-position groups, named uke/counter techniques, first-grade labels, and the separate kōbōgi/idō kōbōgi examples; correct the curated proposal without changing the canonical source data
- [ ] Fine-tune the Kihon page under Training: review whether more headings are needed and whether techniques currently listed farther down should instead be grouped under Kaisoku/Byakuren chūdan gamae or another appropriate starting position
- [x] Separate the grading-test material into a theoretical part under Theory and a practical training part under Training; preserve every requirement, note, sequence, video, and link while deciding how shared material should be presented without duplication
- [x] Audit and remove other obsolete compatibility routes and redirects; preserving legacy URLs is not required. `/groups` was removed when Technique groups moved under Theory; the `/list` redirect and the `?view=all` rewrite were removed too. No URL compatibility shims remain.
- [x] Let touch users long-press a word for the compact dictionary without expanding its collapsible card; keep desktop text selection and normal click/keyboard expansion
- [x] Add a calm, persistent way to mark a weekly-plan session as completed, keyed by grade and week, with the completion timestamp revealed only through a subtle hover/focus tooltip (and tap on touch devices)
- [ ] Decide whether weekly-plan progress should keep a history of repeat sessions, and whether it needs a broader reset function beyond clearing one week at a time
- [ ] Design the permanent Embu data model before enabling backend synchronization: the experimental “Bygg en egen embu” draft is intentionally stored only in local browser storage, must stay outside the growing Cosmos app-data document, and may be discarded/reset when the experimental feature is replaced by the final architecture
- [ ] Audit every card type in Dojo mode—including weekly themes, repetition, kihon, hokei, randori, and embu/kumi-embu—and hide secondary kanji/Japanese translations when the selected app language is not Japanese; when Japanese is the main language, keep the Japanese text as the primary card content
- [ ] Define and fine-tune what Training mode (Dojo presentation) changes on every page where it is available: increase text size, remove irrelevant information, preserve essential training instructions and controls, and review each affected page separately before applying broader rules
- [x] Present broad weekly practice instructions—such as repetition, randori, embu, studies, and preparation for grading—as warm, source-grounded page copy and an open weekly overview instead of technique-like cards; preserve exact details such as randori type and restriction, while keeping individual techniques as the only expandable cards
- [ ] Explore the start-page and intro navigation together:
  - Begin with “What do you want to do today?” and clear entrances for studying or training
  - Offer a route to “What should I focus on this week?” that opens the weekly plan
  - Explore a broader “Practice everything” area, potentially including kihon, randori, embu, kumi-embu, techniques, Tenchi Ken, and other training material
  - Map every existing study and training feature into the new entrances so no content or workflow becomes duplicated, hidden, or stranded
  - Decide whether the question appears on every visit, whether the app remembers the user’s choice, and how someone resumes their most recent activity
  - Decide the wording, grouping, and whether this should be a new app section before implementing it
- [ ] Rework the weekly plan's focus headings: remove the "Veckans innehåll" section label entirely, and restyle the group headings ("Veckans grundarbete", "Återkommande delar", "Repetitionstekniker", …) with the calm small-caps eyebrow look that label uses today, instead of the large serif display style. Keep the section's accessible name when the visible `h2` disappears
- [ ] Merge `test.yml` and `deploy-staging.yml`/`deploy.yml` into a single workflow triggered directly by `push` (test job gating a `needs:`-dependent deploy job), instead of linking them via `workflow_run`. Second reason found on 2026-08-15: the two deploys do not agree with each other. `deploy-staging.yml` waits for Test via `workflow_run`, but `deploy.yml` triggers on `push` directly, so Test and Deploy race and **a red test does not stop a production deploy** — the weaker gate is on the more important environment. `workflow_run`-triggered workflows always execute using the workflow YAML from the default branch (`main`), never the branch that pushed — so any deploy-workflow change only takes effect once it's merged to `main`, which silently broke a staging deploy on 2026-08-13 (a new `FEEDBACK_EMAIL` parameter got dropped because `main`'s copy of `deploy-staging.yml` didn't know about it yet). A `push`-triggered workflow always uses the pushed branch's own file.

## Questions for the next design session

- [ ] What exactly separates Study from Train, and which material should be available in both?
- [ ] Where should the weekly plan appear: on the start page, under Train, under both entrances, or in another position?
- [ ] Should “Practice everything” be a browsable library, a guided practice-session tool, or both?
- [ ] How should practice be grouped—for example kihon, hokei/techniques, randori, embu, kumi-embu, Tenchi Ken, and theory—and where do the app’s existing features belong?
- [ ] Should Dojo mode start automatically when the user chooses Train, or remain an optional switch?
- [ ] Should “What do you want to do today?” appear on every visit, and should returning users be able to continue their most recent activity?
- [ ] What is the smallest useful first version we can build entirely from existing content, without inventing missing training material?
- [ ] For the visual direction, should the app remain primarily dark, should serif fonts be reserved for headings, and how warm or traditional should the palette feel?
