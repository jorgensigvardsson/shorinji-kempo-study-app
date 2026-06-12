# Forms Feature — Design & Implementation Plan

Admins author and publish forms (e.g. "Who is coming to the gasshuku?", "Pick your menu"), users answer them in-app before a deadline, admins view identified submissions, auto-generated summaries, and export to Excel.

## Decisions

- Summaries: automatic by field type — enum → tally per option; integer → sum/average/count; string → list of answers.
- Submissions identified: admin sees respondent display name/email per submission and in export.
- Publish offers optional push notification (checkbox) reusing existing `/push/broadcast` machinery.
- Excel (.xlsx) generated client-side with exceljs (MIT) from already-fetched data — zero backend cost.
- Forms have an explicit `published` boolean (draft state) — see Lifecycle.
- **Form content is not translated** — see "Language of form content" below.

## Language of form content (deliberate non-goal)

Form content — titles, descriptions, field labels, help texts, enum option labels — is authored by an admin in one language and displayed **verbatim** to every user, regardless of the app's UI language. This is a deliberate decision, not an oversight:

- Forms are sent to dojo members, who are expected to speak the same language as the admins. There is no realistic audience for a form in a language the admin doesn't write.
- The alternative is dynamic, admin-supplied translations for every form (per-field, per-language editing UI, fallback rules, summary/export handling). That would be a huge scope inflation for no practical gain at club scale.

Consequences for implementation:
- Form content must **never** be passed through `translator.translate()` and never added to `translations.json` — treat it under the `noTranslate()` principle.
- Only the surrounding app chrome is translated as usual: page titles, buttons, status badges, validation messages, the unanswered-forms toast, empty states, and the form builder's own UI.
- The data model carries plain strings for all content fields; if dynamic translations are ever wanted, they can be retrofitted the same way richer field types can (additive schema change), but this is explicitly out of scope.

## 1. Cosmos data model

Two new containers, created by extending `ProvisionCosmos` in `backend/persistence/internal/store/provision.go`. Shared 400 RU/s database throughput (free tier, no new cost).

| Container | Partition key | Item id | Indexing |
|---|---|---|---|
| `forms` | `/id` | form UUID | default automatic (tiny container, rare writes) |
| `formsubmissions` | `/formId` | **userID** | automatic, excludedPaths `/answers/*` |

Partitioning submissions by `formId` makes the hot paths cheap:
- Resubmit = `UpsertItem(pk=formId, id=userID)` — single-partition point write; "one submission per user per form" by construction.
- "Did user X answer form Y?" = 1 RU point read.
- Admin "list all submissions for form Y" = single-partition query.
- Only cross-partition op is account deletion (`SELECT c.id, c.formId WHERE c.id=@uid`) — rare, and `id` is always indexed.

New env vars in `backend/persistence/main.go` (mirroring `COSMOS_DB_PUSH_CONTAINER`): `COSMOS_DB_FORMS_CONTAINER` (default `forms`), `COSMOS_DB_SUBMISSIONS_CONTAINER` (default `formsubmissions`). Optionally mirror in `infrastructure/modules/cosmos.bicep` for documentation parity.

### Form document (`backend/persistence/internal/store/forms.go`)

```go
type Form struct {
    ID          string  `json:"id"`          // UUID, also partition key
    Title       string  `json:"title"`
    Description string  `json:"description,omitempty"`
    Fields      []Field `json:"fields"`
    Published   bool    `json:"published"`   // draft until true
    ValidFrom   string  `json:"validFrom"`   // RFC3339 UTC
    Deadline    string  `json:"deadline"`    // RFC3339 UTC, > ValidFrom
    Revoked     bool    `json:"revoked"`     // soft-hide from users
    CreatedBy   string  `json:"createdBy"`   // admin userID (sub)
    CreatedAt   string  `json:"createdAt"`
    UpdatedAt   string  `json:"updatedAt"`
}

// Field is a discriminated union: Type selects which spec pointer is set.
// New field types later = new Type value + new spec pointer; old documents
// keep deserializing unchanged. This is the retrofit point for richer values.
type Field struct {
    ID       string       `json:"id"`       // stable short id; answers key on it
    Label    string       `json:"label"`
    Help     string       `json:"help,omitempty"`
    Required bool         `json:"required"`
    Type     string       `json:"type"`     // "integer" | "string" | "enum"
    Repeat   *RepeatSpec  `json:"repeat,omitempty"` // non-nil = vector; v1: integer/string only
    Integer  *IntegerSpec `json:"integer,omitempty"`
    String   *StringSpec  `json:"string,omitempty"`
    Enum     *EnumSpec    `json:"enum,omitempty"`
}

type RepeatSpec  struct { MinItems int `json:"minItems"`; MaxItems int `json:"maxItems"` }
type IntegerSpec struct { Min *int64 `json:"min,omitempty"`; Max *int64 `json:"max,omitempty"` }
type StringSpec  struct { MaxLength int `json:"maxLength,omitempty"` } // server default cap 1000
type EnumSpec    struct {
    Options       []EnumOption `json:"options"`     // stable option IDs survive label edits
    MultiSelect   bool         `json:"multiSelect"` // false: radio; true: checkboxes
    MinSelections int          `json:"minSelections,omitempty"`
    MaxSelections int          `json:"maxSelections,omitempty"` // 0 = unlimited
}
type EnumOption struct { ID string `json:"id"`; Label string `json:"label"` }
```

"Choose one OR many" is `EnumSpec.MultiSelect` (a *set* of distinct options), not `Repeat` on enum (an ordered list with possible duplicates); `Repeat` on enum is rejected in v1 to keep the door open unambiguously.

Derived status (computed, never stored): `draft` (!Published) → `scheduled` (Published, now < ValidFrom) → `active` (ValidFrom ≤ now ≤ Deadline) → `closed` (now > Deadline); `revoked` overrides all.

### Submission document

```go
type Submission struct {
    ID          string                     `json:"id"`     // = userID (sub) → one per user per form
    FormID      string                     `json:"formId"` // partition key
    UserEmail   string                     `json:"userEmail"` // denormalized from JWT
    UserName    string                     `json:"userName"`  // from JWT "name" claim; fallback email
    Answers     map[string]json.RawMessage `json:"answers"`   // fieldID -> value
    SubmittedAt string                     `json:"submittedAt"` // first submit, preserved on overwrite
    UpdatedAt   string                     `json:"updatedAt"`
}
```

Answer wire format: integer scalar `42` / vector `[3,7]`; string scalar `"text"` / vector `["a","b"]`; enum single `"optionId"` / multi `["id1","id3"]`. `json.RawMessage` keeps the store schema-agnostic; the validator interprets values against the field spec. Optional unanswered fields are absent from `Answers`.

## 2. Backend changes

### 2.1 Auth service: add `name` claim (tiny prerequisite)

The JWT today carries only `sub`/`email`/`role`; the display name lives only in the auth `users` container. Add `Name string` to `Claims` in `backend/auth/internal/token/jwt.go`, extend `Issue(...)`, update both call sites in `backend/auth/internal/api/handlers.go` (login + refresh, where `user.DisplayName` is in scope). Persistence denormalizes name+email onto submissions at write time — no cross-service lookups. Staleness ≤ access-token TTL; pre-deploy tokens lack `name` → fall back to email.

### 2.2 Persistence middleware (`backend/persistence/internal/api/middleware.go`)

- `userClaims{Sub, Email, Name, Roles}` struct stored in context by `authMiddleware` (keep `userIDFromContext` untouched); `claimsFromContext(ctx)`.
- `adminMiddleware(ks, issuerURL, next)` = auth + 403 unless roles contain `"admin"` (single token parse, unlike chaining `hasRole`).

### 2.3 Store layer (`backend/persistence/internal/store/`)

`FormsStore` interface: `ListForms`, `GetForm`, `SaveForm` (upsert), `DeleteForm`, `GetSubmission(formID, userID)`, `SaveSubmission` (upsert), `ListSubmissions(formID)`, `DeleteFormSubmissions(formID)`, `DeleteUserSubmissions(userID)`.

Implementations: `forms_cosmos.go` (patterns from `push_cosmos.go`) and `forms_file.go` (+ tests; `data/forms/{formID}.json`, `data/formsubmissions/{formID}/{userID}.json`) for local dev. Wire via `handler.WithForms(formsStore)` in `main.go` (the `WithPush` pattern).

### 2.4 Validation (`backend/persistence/internal/forms/validate.go` + tests)

Pure functions: `ValidateDefinition(f)` and `ValidateSubmission(f, answers)`.

Definition rules: title 1–200 chars; 1–50 fields; field IDs unique/non-empty; labels 1–200; per type: integer `min ≤ max`; string `maxLength` 0–10000 (0 → 1000); enum 1–100 options, unique option IDs, `minSelections ≤ maxSelections ≤ len(options)`; `Repeat` only on integer/string, `0 ≤ minItems ≤ maxItems ≤ 100`, `maxItems ≥ 1`; dates RFC3339 with `deadline > validFrom`. Caps bound documents far below Cosmos's 2 MB limit.

Submission rules: unknown answer keys → 400; every `Required` field present and non-empty (≥ minItems items / ≥ 1-or-minSelections enum choices); type+constraint check per value (integer range and integrality — reject `1.5`; string length; vector length; enum values ∈ option IDs; multi-select distinct within min/max). Optional *present* fields are still fully validated.

### 2.5 API surface (`backend/persistence/internal/api/forms_handlers.go` + tests)

Registered on the **inner** mux in `Register()` (only when `WithForms` called) → inherits rate limiting, CORS, CSRF, secure headers by construction.

User endpoints (`authMiddleware`):

| Endpoint | Behavior |
|---|---|
| `GET /api/v1/forms` | Forms visible now (`Published && !Revoked && ValidFrom ≤ now ≤ Deadline`), each with the caller's own submission: `{"forms":[{"form":{...},"mySubmission":{...}\|null}]}`. Also powers the toast. |
| `GET /api/v1/forms/{id}` | Same shape for one form; 404 if not visible. |
| `PUT /api/v1/forms/{id}/submission` | Upsert own submission. `MaxBytesReader` 64 KB. Body `{"answers":{...}}`. 404 absent/revoked/unpublished; **410** past deadline; **403** before validFrom; 400 on validation failure. Preserves `SubmittedAt`, stamps identity from claims. |

Admin endpoints (`adminMiddleware`):

| Endpoint | Behavior |
|---|---|
| `GET /api/v1/admin/forms` | All forms, all states. |
| `POST /api/v1/admin/forms` | Create (256 KB limit). Server generates ID/timestamps; always created `Published=false`. |
| `PUT /api/v1/admin/forms/{id}` | Full update (definition, window, revoked). Preserves `CreatedAt/CreatedBy`. |
| `POST /api/v1/admin/forms/{id}/publish` | Body `{"notify":bool}`. Sets `Published=true`; if notify and push configured, `pushSender.Broadcast` (title = form title, url = `/forms`). If `now < ValidFrom`, skip push and return `"pushSkipped":"scheduled"` (no scheduler exists). |
| `POST /api/v1/admin/forms/{id}/revoke` (+ `/unrevoke`) | Toggle soft-hide. |
| `DELETE /api/v1/admin/forms/{id}` | Hard delete: submissions then form. 204. |
| `GET /api/v1/admin/forms/{id}/submissions` | `{"form":{...},"submissions":[...]}` — single payload feeding submissions view, summary, and Excel export. |

Account-deletion hook: `deleteAccount` also calls `DeleteUserSubmissions(userID)`.

Time: server clock authoritative, all comparisons UTC.

Tests: `forms_handlers_test.go` over the file store (pattern: `push_handlers_test.go`) — visibility windows, revoked/draft hiding, mandatory rejection, constraint rejection, overwrite preserves `SubmittedAt`, non-admin 403, deadline 410.

## 3. Frontend

### 3.1 Shared plumbing

- `frontend/src/sync/http.ts` (new): extract the private `fetchWithRefresh` from `backend.ts` into a standalone function; `backend.ts` delegates to it.
- `frontend/src/forms/types.ts`: TS discriminated-union mirror of the wire types + `formStatus(f): "draft"|"scheduled"|"active"|"closed"|"revoked"`.
- `frontend/src/forms/api.ts`: typed wrappers for every endpoint, using `VITE_API_URL` like `push.ts`.
- `frontend/src/forms/validate.ts` (+ test): client mirror of submission/definition validation returning per-field translator-key errors; gates the submit button.
- `frontend/src/forms/summarize.ts` (+ test): pure aggregation — enum → per-option counts (multi-select counts each selection); integer → `{count,sum,avg,min,max}` (vectors aggregate all items); string → `{userName, value}` list. Skips answer keys/option ids no longer in the definition.
- `frontend/src/forms/excel.ts` (+ test of row shaping): `exportSubmissionsXlsx(form, submissions)` using exceljs via **dynamic `import("exceljs")`** (own lazy chunk). Sheet "Svar": one row per respondent (name, email, submitted-at, one column per field; vectors/multi joined ", ", enum ids → labels). Sheet "Sammanfattning": summarize.ts output. Download via Blob + anchor (pattern: `exportAccount` in `backend.ts`). Add `"exceljs": "^4.4.0"` to `frontend/package.json`.

### 3.2 User pages

- `frontend/src/Forms.tsx` (route `/forms`): card per visible form (title, description, deadline, Besvarad/Obesvarad badge); sign-in prompt if no backend user.
- `frontend/src/FormFill.tsx` (route `/forms/:id`): dynamic renderer — integer → `Form.Control type="number"`; string → text/textarea; enum single → radios or `Form.Select`; enum multi → checkboxes; vectors → add/remove rows bounded by repeat spec. Prefills from `mySubmission` (resubmit = same PUT). Live validation, submit disabled until valid; 410/403 → friendly "stängd/inte öppnad" alert. Admin-authored form content is shown verbatim — never passed through `translator.translate` (the `noTranslate()` principle).

### 3.3 Admin pages

- `frontend/src/admin/FormsAdmin.tsx` (route `/admin/forms`): table with status `Badge`, actions edit / publish (modal with "skicka push-notis" checkbox) / revoke / unrevoke / delete (confirm modal warning submissions are destroyed).
- `frontend/src/admin/FormBuilder.tsx` (routes `/admin/forms/new`, `/admin/forms/:id/edit`): no-JSON editor — title, description, `datetime-local` validFrom/deadline (local→UTC on save); field list with add/remove/reorder; per field: label, required switch, type select (Heltal/Text/Flerval) + type-specific controls; enum option editor with stable option ids (`crypto.randomUUID().slice(0,8)`, generated once, never regenerated on label edit); "lista av värden" toggle (integer/string) exposing min/max items. Warns when editing a published form with submissions.
- `frontend/src/admin/FormSubmissions.tsx` (route `/admin/forms/:id/submissions`): summary section (auto by field type) + raw table (name, email, updated-at, answers) + "Exportera till Excel" button.

### 3.4 Routing & nav (`routes.tsx`, `App.tsx`)

- Add `hideInMenu?: boolean` to the `Route` interface; respect it in `AppNavbar` menu rendering.
- Routes: `/forms` (only when signed in; in dropdown), `/forms/:id` (hidden), and the admin block gated like `/broadcast`: `/admin/forms` (menu "Hantera enkäter") + hidden `/admin/forms/new`, `/admin/forms/:id/edit`, `/admin/forms/:id/submissions`.

### 3.5 Toast: unanswered forms (`AppToasts` in `App.tsx`)

Hook `useUnansweredFormsPrompt()` in `frontend/src/forms/usePrompt.ts`:
- Trigger on mount and on `visibilitychange` → visible (the "returned after inactivity" signal, same pattern as the update toast), if signed in: `listForms()`; unanswered = `mySubmission === null`.
- Throttle: localStorage `forms-prompt-state` = `{lastFetchAt, prompted: Record<formId, ISO>}`. Skip fetch if `lastFetchAt` < 15 min (also protects the 2 rps rate-limit budget). Show toast only if some unanswered form was never prompted or last prompted > 24 h ago; dismissing stamps all currently-unanswered forms. A newly published form prompts immediately; submitting stops prompting naturally; entries pruned when forms disappear.
- Body: "Obesvarade enkäter" / "Du har {N} enkät(er) som väntar på svar.", buttons "Visa" (→ `/forms`) and "Stäng".

### 3.6 i18n + changelog

All new Swedish UI strings get `ja`/`en`/`tr` entries in `translations.json` (test-enforced). Admin-authored form content is never translated. Changelog entry when the user-facing phase ships.

## 4. Lifecycle: explicit `published` flag (draft state)

`validFrom` alone is insufficient: the publish *event* is what the optional push hangs on, and admins need to build forms incrementally without racing the clock or parking fake dates. Lifecycle: **draft → scheduled → active → closed**, with **revoked** as an orthogonal override. No "unpublish" in v1 — revoke covers "hide it again".

## 5. Phasing (incremental PRs)

- **Phase 0 — Auth name claim**: `jwt.go` + two call sites + token tests. Deploy ahead so tokens carry `name`.
- **Phase 1 — Backend model + endpoints**: store types/interfaces, file+cosmos impls, provisioning, main.go wiring, validation pkg + tests, all handlers + tests, account-deletion hook, middleware claims/admin wrapper. Include publish-side push (~15 lines), UI later. Verify with file backend via docker-compose.
- **Phase 2 — Admin builder + lifecycle UI**: http.ts extraction, types/api/validate(definition), FormsAdmin, FormBuilder, routes + `hideInMenu`, translations. Admins can author/publish/revoke/delete end-to-end before users see anything.
- **Phase 3 — User fill + toast**: Forms, FormFill, submission validation, routes/menu, usePrompt + toast, translations, changelog entry. Feature goes live.
- **Phase 4 — Summary + Excel export**: summarize.ts, FormSubmissions, excel.ts + exceljs dep, translations.
- **Phase 5 — Push on publish (UI)**: publish-modal checkbox wired to `notify`, scheduled-form push warning, translations.

## 6. Risks & open questions

1. **Editing published forms with submissions**: removed fields/options orphan answers; summaries/export skip unknown ids; builder warns loudly. Open: hard-lock structural edits once submissions exist? Default: warn, don't lock (club scale, trusted admins).
2. **Push for scheduled forms**: no scheduler exists; pushing for a future-validFrom form links to a closed form. v1: warn and skip.
3. **Name-claim staleness** (≤ token TTL) and pre-deploy tokens without `name` (email fallback) — acceptable; resubmission refreshes identity.
4. **RU budget**: all hot paths point ops or single-partition queries; only the tiny `forms` scan is cross-partition; 15-min client throttle bounds background load. Stays on free tier.
5. **exceljs size** (~250 KB gz): dynamic import isolates it; PWA precache will include the chunk — acceptable, or exclude via workbox glob later.
6. **Deadline races**: server time authoritative; client renders 410/403 as friendly closed/not-open states.
7. **Concurrent admin edits**: last-write-wins in v1; Cosmos etags available as future work.
8. **Form content i18n**: authored in one language, shown verbatim to all locales — deliberate non-goal, see "Language of form content" above.
9. **Open**: should users who answered see closed forms read-only ("what did I submit")? Requirements say admin-only after deadline; v1 follows that; trivially relaxable later.
