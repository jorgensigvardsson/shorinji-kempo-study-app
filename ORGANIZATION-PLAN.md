# Organization & Membership — Design & Implementation Plan

Model Shorinji Kempo's organizational structure (WSKO → national federations → branches), tie every
user to exactly one branch, and replace the single global `admin` role with scoped admin roles that
mirror the organization. Then gate account creation behind an admission decision made by the branch
the applicant wants to join.

## Status

**All four phases are built** and deployed nowhere. Everything below runs on the file-based stores;
no Cosmos account, staging or production has been touched, by decision — see §8.

| | Where |
|---|---|
| ✅ Organization tree | `store.OrgNode` with file and Cosmos stores; `org.Tree` held in memory, loaded at startup |
| ✅ Scoped roles | `authz.Covers` — the one function behind every organizational permission |
| ✅ Scoped admin endpoints | listing, rename, set-roles, force-logout, each against the scope it touches |
| ✅ Organization endpoints | public branch picker, scoped tree, create/rename/move |
| ✅ Token claims | `branch` and `fed`, resolved when a token is minted; `/auth/me` resolves the federation too |
| ✅ Migration tool | `backend/auth/cmd/orgmigrate` |
| ✅ Admission (Phase 2) | enrollment issues a join ticket instead of an account; requests, decisions and their mail — §5 |
| ✅ Admin UI (Phase 3) | organization tree, branch members, one user, the waiting list, and the menu's count — §6 |
| ✅ Member language | reported by the app, so unprompted mail is written in a language the reader reads — §1.5 |
| ✅ GDPR wording | the register in BACKEND.md, and a privacy policy that no longer claims no other user can see you — §9 |
| ✅ Swedish wording | one word for the organizational unit: **klubb** — see below |
| ✅ Transfers (Phase 4) | a member who has moved asks the club there to take them in; the one they left is told — §7 |

Every phase in this document is built and green against the file-based stores. What remains:

| | What | Where |
|---|---|---|
| ⬜ | A native reading of the ja/tr copy. Every UI string is translated, but the Japanese and Turkish are mine, not a speaker's — as is all of the mail copy | |
| ⬜ | Deployment — the two out-of-band indexing changes, then deploy, then migrate | §8 |
| ⬜ | Who gets notified, and of what — needs a real look before shipping, see below | |
| ⬜ | Push notification audiences — a broadcast still reaches every phone in WSKO, so the send stays on `admin` alone and no branch admin can tell their own club anything. Designed, not built | [PUSH-AUDIENCE-PLAN.md](PUSH-AUDIENCE-PLAN.md) |
| ⬜ | Loading indicators on every page that fetches from a backend service, before shipping — see below | |
| ⬜ | Audit trails for administrative operations (who did what and when?). Useful for general change logs. Don't fetch data by default, make "Show history" an explicit action. Audit trails should also be compartmentalized. A branch admin should not see how federations have moved, etc. | |


None of it blocks the rest, and nothing here has met Cosmos yet.

One thing found while building Phase 3 and fixed there: both `admin` and `wsko_admin` scope to the
root, so the covering rule alone let a WSKO admin grant `admin` — the one power the split was meant
to keep apart. Granting or revoking it now requires holding it.

Below, each phase heading carries its state; the design text is left as written, with **As built**
notes where the code settled somewhere the plan did not foresee.

### TODO: who gets notified, and of what

§5.3 and §7 settled *who is notified* for the two flows built so far — a join request's branch, a
transfer's destination branch and, on departure, the branch left — each by language rather than by
person, and each decided narrowly while building that one flow. Nobody has looked at the notification
story as a whole, and it deserves one before this ships. Raised but not resolved:

- **Does a federation admin hear about their branches' join requests and transfers, or only the
  branch admin?** Today it's the branch alone. A federation admin can already see everything under
  them through the covering rule — whether they should also be *told*, unprompted, is a different
  question with a different answer.
- **Does a WSKO admin hear about anything happening below them?** Currently nothing — WSKO admins
  learn of a request only by looking. Silence might be right; it might also mean an admin at the top
  has no idea the organization is active at all.
- **What happens as a branch or federation accumulates several admins?** Every admin at the relevant
  scope is mailed today (grouped by language, per §5.3). That's fine at one or two; it is not
  obviously fine at ten — this is where "who gets notified" turns into "how many people get the same
  email," which is its own kind of noise.
- **Is there ever a reason to notify *up* the tree on something other than a request?** A branch
  moving to a different federation (the new "Byt förbund" control) changes who administers its
  members with no notification to anyone — the admins gaining or losing sight of that branch's
  members currently just have to notice.
- **Should any of this be configurable per admin**, or is a fixed rule (branch only, or branch +
  federation, or branch + federation + WSKO) good enough for an organization this size?

None of this blocks what's built. It matters before more notification-sending flows are added on top
of the current ad hoc per-flow decisions, since each one so far has picked its own answer rather than
following a stated rule.

**All of the above is about mail.** Push is the other half of the same question and is not asked
anywhere in this document: `POST /push/broadcast` sends to every stored subscription, so the one
audience that reaches every phone in the organization is the one nothing here scopes. That is why
the send is confined to `admin` — which is a bound on who may send rather than on who receives, and
it leaves a branch admin unable to tell their own club that training is cancelled. Designed, not
built, in [PUSH-AUDIENCE-PLAN.md](PUSH-AUDIENCE-PLAN.md); it reuses `authz.Covers` and the tree, so
whatever rule this section settles on should be the same rule there.

### TODO: loading indicators wherever a page fetches from a backend service

Both backend services are expected to run scaled to zero when idle, which is fine for cost and bad
for a first impression: the request that wakes one up is slow in a way none of the requests after it
are, and right now nothing on screen says so. `AdminOrganization.tsx` and `AdminRequests.tsx` are the
two built in this document — the organization tree and the waiting list — but this is not specific to
either of them; it applies to every page that fetches from either service on load, which is most of
the app.

Address this before shipping: an admin opening the organization page or the request queue for the
first time in a while should see that something is happening, not a blank page that resolves itself
seconds later with no explanation.

### One word each: klubb, branch, 支部, kulüp

The Swedish user-facing word for the organizational unit is **klubb**. It used to be *gren* on
everything written after the registration screen, which said *klubb* — and a reader who saw both
would reasonably have assumed they were different things.

**The rename is user-visible Swedish only.** The code, the API and these documents say *branch*
throughout: the code is written in English, the model has not changed, and renaming `BranchID` to
chase a Swedish preference would be churn with no reader on the other end.

Two things made it more than a search and replace:

- **Swedish strings are the translation keys**, so every reworded string was a new key and an
  orphaned old one. Source, tests and all three translation files moved in one pass, and the
  missing-key check was run afterwards — a string missed here does not break, it silently shows
  Swedish to everybody, which is the failure that would have gone unnoticed.
- **Renaming merged two keys into one.** "Gren" and "Klubb" had been separate, and carried different
  English (*branch* against *club*) and different Japanese (支部 against クラブ). Each language now
  says one thing: *branch* in English, which is WSKO's own word; 支部 in Japanese, which is Shorinji
  Kempo's; *kulüp* in Turkish, which it already said throughout. The four words are not literal
  translations of each other, and do not need to be.

## The organization

```
                        [ WSKO ]
                       /        \
                      1          1
                     /            \
                    *              *
                   /                \
[ National federation ]              [ Branch ]
        |
        1
        |
        *
        |
    [ Branch ]
```

- WSKO has any number of member national federations and any number of directly attached branches.
- A national federation has any number of member branches.
- A branch belongs to a federation **or** directly to WSKO — never both, never neither.
- A practitioner belongs to exactly one branch.

## Decisions

- **Everything is built against the file-based stores first.** Cosmos is a deployment detail, not a
  development dependency; nothing in this plan requires touching staging until the whole thing works
  locally. See §3.
- **Nothing ships until every phase is done.** The four phases are a build order, not a release
  schedule. Shipping Phase 1 alone would leave enrollment creating users with no branch — a state
  only a global admin can see — and that window has no reason to exist in production when it costs
  nothing locally. See §8.
- **WSKO is implicit.** It is the root of the tree, not a stored record. There is one international
  body and modelling a second buys nothing but joins.
- **The "at least 4 branches per federation" rule is not enforced.** It is a WSKO governance rule,
  not a data-integrity rule. Enforcing it makes every federation impossible to bootstrap and every
  branch move conditionally illegal. If it ever needs to be visible, it belongs in the admin UI as a
  badge, not in a write path.
- **A branch's federation is a nullable reference.** Empty means "direct WSKO member". The
  exclusivity constraint is then unrepresentable rather than validated.
- **Federations are identified by ISO 3166-1 alpha-2 country code** (`SE`, `JP`, `GB`). One
  federation per country, structurally. Should a country ever have two, the id becomes `SE-2` and
  nothing else changes.
- **Organizations carry their own name in their own language** — "Svenska Shorinji Kempoförbundet",
  not "Swedish Shorinji Kempo Federation". The name is a proper noun: stored once, displayed
  verbatim to every user regardless of UI language, never passed through `translator.translate()`,
  never added to `translations.json`. Same principle as form content on the `forms` branch.
- **Pending applicants are not users.** They live in their own container and become a user record
  only on approval.
- **Roles are scoped strings in the existing flat `role` claim** — `admin`, `wsko_admin`,
  `federation_admin:SE`, `branch_admin:<uuid>`. Every existing exact-match check on `"admin"` keeps
  working untouched.
- **A user may hold any number of scoped roles**, and holding an admin role for a branch does not
  imply membership in it.
- **Authority delegates downwards.** You may grant a role whose scope you already cover.
- **`admin` remains the technical superuser and a superset of `wsko_admin`.** `wsko_admin` is
  defined and grantable from day one but granted to nobody, so the two can diverge later without a
  migration.
- **Members request their own branch transfers.** No sending-branch handshake; the receiving branch
  decides and the old branch is told. See §7.

---

## 1. Data model

### 1.1 Organization tree (`organizations` container, auth service)

One container holding both node kinds, discriminated by `type`. Federation ids are two-letter
country codes and branch ids are UUIDs, so the id spaces cannot collide.

```go
// backend/auth/internal/store/org.go

type OrgNode struct {
    ID           string `json:"id"`                     // "SE" for federations, UUID for branches
    Type         string `json:"type"`                   // "federation" | "branch"
    Name         string `json:"name"`                   // the organization's own name, own language
    FederationID string `json:"federationId,omitempty"` // branches only; empty = direct WSKO member
    CreatedAt    string `json:"createdAt"`
    UpdatedAt    string `json:"updatedAt"`
}

type OrgStore interface {
    List() ([]*OrgNode, error)   // full scan; the container is tiny
    Get(id string) (*OrgNode, error)
    Save(node *OrgNode) error
}
```

| Container | Partition key | Indexing |
|---|---|---|
| `organizations` | `/id` | `consistent`, all paths excluded — enough to permit `SELECT * FROM c` at zero write-time index cost (the `refresh_tokens` precedent) |

**The tree is cached in memory.** The auth service runs min 1 / max 1 replica — the same constraint
that lets OIDC pending state and verification codes live in-process — so an in-process cache is
coherent by construction. `OrgTree` loads the full list at startup and rebuilds on every write, and
every branch → federation resolution afterwards costs 0 RU. At the scale involved (tens of
federations, hundreds of branches at the very most) this is a few kilobytes.

```go
// backend/auth/internal/org/tree.go
type Tree struct { /* id → node, federationID → []branchID */ }

func (t *Tree) Branch(id string) *store.OrgNode
func (t *Tree) FederationOf(branchID string) string   // "" for direct WSKO members
func (t *Tree) BranchesIn(federationID string) []string
func (t *Tree) Reload() error
```

### 1.2 Branch membership on the user

```go
// backend/auth/internal/store/store.go
type User struct {
    ...
    BranchID string `json:"branchId,omitempty"`
}
```

Nullable at the schema level, non-null by invariant now that Phase 2 is built: enrollment no longer
creates a user at all, so every account is either admitted into a branch or migrated into one. The
field stays nullable because the migration is what fills it in, and because a record written before
all this existed must still decode.

A user with no branch is visible only to a global admin: `Covers` reads an empty branch id the same
way it reads an unknown one, which is the right answer — someone who belongs to nothing belongs to
the root. After Phase 2 the state is unreachable, so writing a user without a branch is logged as a
warning rather than tolerated quietly. The window in which it is reachable at all belongs to
development, not to production; see §8.

`users` container indexing must gain `/branchId`:

```
IncludedPaths: [{Path: "/branchId/?"}]
ExcludedPaths: [{Path: "/*"}]
```

> **Trap.** `ProvisionCosmos` skips containers that already exist (409 ignored), so this policy
> change does **not** reach prod or staging by deploying code. It must be applied out-of-band to
> both, exactly like the `none` → `consistent` change already noted for `users` in BACKEND.md. Do it
> **before** deploying code that queries by `branchId`, or every scoped user listing returns nothing.
> Irrelevant locally — the file store has no indexes to get wrong.

### 1.3 Roles

`RoleRecord` and the `RoleStore` interface keep their shape — keyed by lowercased email, holding a
`[]string`. Existing records (`{"id": "…", "roles": ["admin"]}`) need no migration. Email keying is
deliberate: it lets a role be granted to somebody who does not have an account yet.

Two additions:

```go
type RoleStore interface {
    Roles(email string) ([]string, error)
    SetRoles(email string, roles []string) error
    ListAll() ([]RoleRecord, error)   // NEW: reverse lookup "who holds role R?"
}
```

`ListAll` needs the `roles` container to be **queryable**, and it used `none` indexing, which blocks
queries outright. `provision.go` now creates it `consistent` with all paths excluded — zero
write-time cost, scan permitted. That covers new environments only: staging and prod already have
the container, so the change is owed to them out-of-band, exactly as above. The file store holds the
whole map in one JSON file, so `ListAll` there is a one-liner.

Like the org tree, the reverse index (role → emails) is held in memory in the auth service and
rebuilt on write. It is needed to answer "who administers this branch?" when a join request arrives.

### 1.4 Join requests (`joinrequests` container, auth service) — Phase 2

```go
// backend/auth/internal/store/joinrequest.go
type JoinRequest struct {
    ID                 string `json:"id"`       // lowercased email — one request per address, structurally
    Email              string `json:"email"`
    Name               string `json:"name"`     // supplied by the applicant
    Note               string `json:"note,omitempty"` // free text, capped at 500 chars
    BranchID           string `json:"branchId"`
    Provider           string `json:"provider"` // "google" | "microsoft" | "email"
    Sub                string `json:"sub"`      // provider subject, so approval can link the identity
    Language           string `json:"language"` // applicant's UI language, for decision mail
    Status             string `json:"status"`   // "pending" | "denied"
    CreatedAt          string `json:"createdAt"`
    DecidedAt          string `json:"decidedAt,omitempty"`
    DecidedBy          string `json:"decidedBy,omitempty"` // deciding admin's user id
    PreviouslyDeniedAt string `json:"previouslyDeniedAt,omitempty"`
    TTL                int32  `json:"ttl,omitempty"`       // seconds; set only on denial
}
```

| Container | Partition key | Indexing | TTL |
|---|---|---|---|
| `joinrequests` | `/id` (lowercased email) | `consistent`, include `/branchId/?` and `/status/?` | `DefaultTimeToLive: -1` (enabled, no default expiry) |

Partitioning by email rather than by branch makes "one pending request per address" structural — a
point read answers it — at the cost of a cross-partition query for "list requests for my branch".
That container will hold tens of items; the trade is worth it.

**Retention is a per-item `ttl`, honoured by both stores.** Pending requests never expire —
they carry no `ttl` at all. Denial sets one 90 days out, after which Cosmos drops the row and the
file store hides it. That parity is not free: the file store gained the `_ts`/`ttl` contract for
this purpose (`filettl.go`), simulating the system timestamp Cosmos maintains, so a rule that only
ever fires months later is not a rule that only works in production. Approved requests are deleted
outright: the user record supersedes them, so no applicant PII lingers.

One consequence worth knowing: `ttl` is measured from the *last write*, not from creation, because
that is what `_ts` means in Cosmos. A denied record is never written again, so its clock never
resets — but any future field that expires must not be attached to a document that gets re-saved.

> **File-store hazard.** `FileUserStore.List()` scans `baseDir/*.json` and decodes each file into a
> `User` — and `json.Unmarshal` does not fail on a document with none of the right fields, so a stray
> top-level JSON file becomes a phantom user with an empty ID in the admin listing. The role store
> already dodges this by living in a subdirectory
> ([file.go:68](backend/auth/internal/store/file.go:68)). `FileOrgStore` and `FileJoinRequestStore`
> must do the same: `organizations/` and `joinrequests/` under the data dir, never beside the users.

### 1.5 User language — ✅ built

Admin-facing mail ("a new membership request arrived") had no language to render in: the app's
language lives in the browser. `User` now carries `Language`, and the app reports it through
`PUT /auth/me/language` whenever it changes and once per session — both sides skip the write when
nothing has changed, so opening the app is not a store write.

Two things it turned out to need beyond the field itself. An approved applicant keeps the language
they applied in, which is the best guess anyone will ever have about the one to write to them in.
And the notice to the deciding admins is sent **once per language rather than once per request**: a
message can be in only one, and two Swedish admins still share a single thread. Grouping costs a
full user scan — roles are keyed by email and users by UUID, with no index between them — which is
the cheaper mistake for something that happens when somebody applies to a club.

The tag is checked for shape rather than against a list of the languages the app ships, so adding
one to the frontend needs no edit on the server; an unknown tag falls back when mail is rendered.

---

## 2. Roles, claims and authorization

### 2.1 Role strings

| Role | Scope | Notes |
|---|---|---|
| `admin` | everything | Unchanged. Technical superuser: push broadcast, force-logout, plus everything below |
| `wsko_admin` | whole organization | Defined and grantable; granted to nobody at migration |
| `federation_admin:<CC>` | one federation and its branches | e.g. `federation_admin:SE` |
| `branch_admin:<uuid>` | one branch | |

### 2.2 Claims

The `role` claim keeps its shape (`[]string`, omitted when empty), so
`containsRole(claims.Roles, "admin")` in both services keeps working with no edit. Two claims are
added, following the same reasoning that put `name` in the token for forms — persistence will need
branch scoping eventually and must not call back into auth for it:

```json
{
  "sub":    "<user UUID>",
  "email":  "jane@example.com",
  "name":   "Jane Doe",
  "role":   ["branch_admin:8f3c…"],
  "branch": "8f3c…",
  "fed":    "SE",
  "fam":    "…"
}
```

`branch` and `fed` are both `omitempty`; `fed` is derived from the tree at issue time and is absent
for members of a directly-attached branch. Both are stale for at most the access-token lifetime
(1 h), which is the right amount of precision for a branch transfer.

### 2.3 The covering rule

One function decides every authorization question in the system:

```go
// backend/auth/internal/authz/scope.go
type Kind string // "wsko" | "federation" | "branch"
type Scope struct { Kind Kind; ID string }

// Covers reports whether the caller's roles grant authority over scope s.
func Covers(roles []string, s Scope, tree *org.Tree) bool
```

- `admin` and `wsko_admin` cover every scope.
- `federation_admin:F` covers `{federation, F}` and `{branch, B}` for every B whose `federationId`
  is F.
- `branch_admin:B` covers `{branch, B}` only.

Everything else falls out of it:

- **Seeing a user** — `Covers(roles, {branch, user.BranchID})`.
- **Creating a branch** — `Covers(roles, {federation, F})` for the requested federation; creating a
  *directly attached* branch is `{wsko}` and therefore global-admin only.
- **Moving a branch between federations** — must cover both the source and the destination scope,
  which in practice means `{wsko}`.
- **Granting a role** — `Covers(callerRoles, scopeOf(grantedRole))`. Delegation downwards, and
  sideways within your own scope, falls out for free.

The existing self-demotion guard generalizes: a caller may not strip their own `admin`/`wsko_admin`
(409, as today). Scoped roles may be self-removed — someone above can always re-grant them.

**As built, one rule does not fall out of covering.** `admin` and `wsko_admin` both scope to the
root, so "grant what you cover" let a WSKO admin mint an `admin` — including for themselves, which
is the whole of the difference between the two roles handed over in one click. Granting or revoking
`admin` therefore requires holding `admin`, checked beside the covering test rather than inside it:
it is a fact about that particular role, not a new shape of authority, and burying it in `Covers`
would make the one function that answers everything answer something else as well.

`Covers` is pure and takes the tree as a parameter, so its tests need no store at all.

---

## 3. Working locally

Every phase below is developed and verified on the **file-based stores**, via `docker-compose up`.
Nothing here needs Cosmos, and nothing needs staging until the whole feature is finished and you
choose to deploy it.

### 3.1 What already makes this work

- **Store selection is automatic.** `backend/auth/main.go:93` picks Cosmos only when
  `COSMOS_ENDPOINT` *and* `COSMOS_KEY` are both set; the compose file passes them through from the
  environment, so leaving them unset gives file stores with zero configuration.
- **Mail goes to stdout.** With `SMTP_HOST`/`SMTP_FROM` unset, `email.LogSender` logs instead of
  sending. Every join-request notification, approval and denial mail in Phase 2 is readable with
  `docker compose logs -f auth` and reaches nobody's inbox.
- **The signing key is generated on first run**, so join tickets (§5.1) work locally with no setup.

### 3.2 What this plan adds to keep the two stores at parity — ✅ all built

- `FileOrgStore` and `FileJoinRequestStore` alongside their Cosmos twins, in **subdirectories** for
  the reason given in §1.4.
- `ListByBranches` on `UserStore`: a Cosmos `ARRAY_CONTAINS` query, a filtered in-memory scan on the
  file side.
- `ListAll` on `RoleStore`: a container scan on Cosmos, a single JSON read on the file side.
- A `ttl` contract in the file store (`filettl.go`, already built): writes stamp `_ts` the way
  Cosmos does, and reads and scans skip documents that have outlived their `ttl`. Absent, zero and
  -1 all mean "never expires", matching Cosmos; a document carrying a `ttl` but no `_ts` is kept
  rather than treated as expired at the epoch.
- `email.Sender` gains four methods; `LogSender` must implement them too or the build breaks — which
  is the point.

### 3.3 Bootstrapping a local environment

An empty data dir has no organizations, so the first thing needed is a seed. The migration tool of
§4.3 is written against the `store` interfaces rather than Cosmos, so **the same tool seeds a local
data dir**: it creates `SE`, creates the Karlstad branch, and stamps every existing local user with
it. Becoming an admin locally stays what it is today — an entry in `data/roles/roles.json`:

```json
{ "you@example.com": ["admin"] }
```

From there, every scoped role is grantable through the UI, so a local environment can reproduce a
federation admin, a branch admin, and a plain member without hand-editing anything further.

### 3.4 Verifying

`go test ./...` under `backend/` covers the store, tree, `Covers` and handler layers; the file stores
are what the existing handler tests already use, so new tests get scope coverage for free. Frontend
checks run with `npm run build` — **not** `tsc --noEmit`, which checks nothing in this repo.

Deployment — the two Cosmos indexing changes, the provisioning additions, and running the migration
against prod — happens once, after every phase is finished, and is described in §8.

---

## 4. Phase 1 — Organization and scoped roles — ✅ built

Backend only, plus the minimum frontend edit to keep the existing admin page compiling. No admission
gate yet: enrollment still auto-creates users, who simply have no branch until an admin assigns one.
(That window closed in Phase 2, and never existed anywhere but a local data dir.)

### 4.1 Auth service

**New** — `internal/store/org.go` (types + interface), `org_cosmos.go`, `org_file.go`;
`internal/org/tree.go` (in-memory tree); `internal/authz/scope.go` (role parsing + `Covers`).
`internal/store/provision.go` gains the `organizations` container and the two indexing changes.
`main.go` gains `COSMOS_ORGS_CONTAINER` (default `organizations`), mirroring the existing container
flags, and constructs `FileOrgStore` in the else-branch beside the other file stores.

**Changed** — `UserStore` gains `ListByBranches(ids []string) ([]*User, error)`; the Cosmos
implementation issues `SELECT * FROM c WHERE ARRAY_CONTAINS(@ids, c.branchId)` and the file
implementation filters in memory. `RoleStore` gains `ListAll`.

**Endpoints** (all inside the existing `secureheaders → cors → csrf → ratelimit` chain):

| Method | Path | Description |
|---|---|---|
| GET | `/auth/org/branches` | **Unauthenticated.** `[{id, name, federationId, federationName}]` for the Phase 2 branch picker. No PII — club lists are public information anyway. Served from the in-memory tree, so it costs nothing |
| GET | `/auth/admin/org` | The tree as the caller may see it (whole tree for global/WSKO, own federation for a federation admin, own branch for a branch admin). Branches belonging to no federation come back as their own group, headed **WSKO** — they hang from the root, and a listing without that heading reads as though they had been left out |
| POST | `/auth/admin/federations` | `{id, name}`; id validated as two uppercase letters. Requires `{wsko}` |
| PATCH | `/auth/admin/federations/{id}` | Rename. Requires `{federation, id}` |
| POST | `/auth/admin/branches` | `{name, federationId?}`. Placement comes from the body: an omitted `federationId` means WSKO-attached and requires `{wsko}`, and a federation the caller does not cover is refused. **As built, this refuses rather than forces** — an earlier draft rewrote a federation admin's request to their own federation, but silently changing a request to fit the requester's authority is a worse habit than refusing one that exceeds it, and the UI knows the federation to pre-fill |
| PATCH | `/auth/admin/branches/{id}` | Rename and/or move. A move requires covering both old and new scope |
| GET | `/auth/admin/users` | **Now scoped.** Global/WSKO → full scan as today; otherwise the union of `ListByBranches` over every branch the caller covers, deduplicated |
| PUT | `/auth/admin/users/{id}/roles` | Body becomes `{roles: ["branch_admin:…"]}`, replacing `{admin: bool}`. Rejects 403 unless the caller covers the scope of **every** role added or removed — and, for `admin` itself, unless they hold it (§2.3) — and 404 unless the caller can see the target user. Only the roles that actually *change* are checked, so a grant made from further up survives an edit by somebody who could not have made it |

`GET /auth/me` returns `branchId`, the resolved federation, and live roles, so the admin UI reflects
a grant immediately rather than at the next token issue.

### 4.2 Frontend (minimal)

`AdminUsers.tsx` survived Phase 1 largely intact — its admin toggle switched from
`adminSetAdmin(id, bool)` to `adminSetRoles(id, string[])` in `sync/backend.ts`, sending the target's
full role array. No compatibility shim on the backend; the two shipped together. Phase 3 then deleted
the page outright, so this edit exists only in the history.

### 4.3 The migration tool

`backend/auth/cmd/orgmigrate`, written against the store interfaces so it runs against a local data
dir or a Cosmos account on the same environment variables the services read. (Not `tools/migrate`,
which BACKEND.md described but which does not exist in the repo — and could not live there anyway,
since importing `internal/store` requires being under `backend/auth/`.)

1. Create federation `SE`, "Svenska Shorinji Kempoförbundet".
2. Create the Karlstad branch under `SE`.
3. Set `branchId` on every existing user to that branch.
4. Grant nobody `wsko_admin` — `admin` already covers it.

Two properties it is built for. **A dry run is the default**: without `--apply` it writes nothing
and reports what it would do, since a negated `--dry-run=false` is easiest to get wrong on the one
run that matters. And **re-running is safe**: the branch is matched by name within its federation,
because its id is a UUID and a second run would otherwise mint a duplicate and quietly split the
club in two; users who already have a branch are counted and left alone, including any who have
since moved, so it stays safe to run after Phase 2 exists.

It is used from the moment it exists — it seeds every local data dir throughout development, so by
the time it runs against prod (§8) it is the most exercised code on the branch.

---

## 5. Phase 2 — Admission — ✅ built

Split in two, because 5.1 is surgery on the two busiest paths in the auth service and deserves to
land and be observed on its own before any UI depends on it.

### 5.1 Phase 2a — Enrollment stops creating users

Today an unknown OIDC identity is enrolled at
[handlers.go:352](backend/auth/internal/api/handlers.go:352) and an unknown address is created in
`emailVerify`. Both change to mint a **join ticket** instead: a short-lived (15 min) signed JWT with
audience `shorinji-join`, carrying the verified `provider`, `sub`, `email` and provider display name,
delivered as an httpOnly cookie. Never as a query parameter — it carries an email address.

- `GET /auth/callback`, unknown identity → set the join-ticket cookie, redirect to
  `frontendURL + "?join=1"`.
- `POST /auth/email/verify`, valid code for an unknown address → set the join-ticket cookie, respond
  `{action: "join_required"}` instead of session cookies. This is a fourth outcome for the login
  screen's state machine, alongside `oidc` / `existing` / `new`.
- `GET /auth/join/context` → `{email, name, pending?: {branchName, createdAt}}`, read from the
  ticket, so the registration screen can prefill and can recognise a returning applicant.

Known identities are entirely unaffected: existing users log in exactly as they do today.

### 5.2 Phase 2b — Requests and decisions

| Method | Path | Description |
|---|---|---|
| POST | `/auth/join/request` | Join ticket + `{branchId, name, note, language}`. 409 `{reason:"pending"}` when a pending request already exists for that address. Carries its own **global** rate limiter alongside the per-IP one, like `/auth/email/start` — denied applicants may re-apply, and an admin's inbox is as much a quota as the mail relay is |
| POST | `/auth/join/withdraw` | Join ticket only. Deletes the caller's own pending request |
| GET | `/auth/admin/requests` | Pending requests across every branch the caller covers |
| POST | `/auth/admin/requests/{email}/approve` | Creates the user (UUID, email, name, linked identity from the stored provider/sub, `branchId`), writes the identity index entry, deletes the request, mails the applicant |
| POST | `/auth/admin/requests/{email}/deny` | Sets `status: "denied"`, `decidedBy`, `ExpiresAt` and `ttl`; mails the applicant |

**Who gets notified.** Holders of `branch_admin:<B>`; if none, holders of `federation_admin:<F>` for
B's federation; if none, holders of `admin`. There is always at least one global admin, so a request
can never rot unseen — which was the failure mode of notifying branch admins alone, since on day one
no branch except Karlstad has any.

**Re-application after denial** overwrites the denied record with a fresh pending one, copying
`decidedAt` into `previouslyDeniedAt` so the next admin sees "previously denied on …" rather than
judging blind.

### 5.3 Mail

New messages on the existing `email.Sender` interface, following the `SendFeedback` /
`renderFeedback` precedent (multipart/alternative, localized, dark-mode aware). `LogSender` gets the
same methods, which is how they are exercised locally.

| Message | To | Language |
|---|---|---|
| "A new membership request for &lt;branch&gt;" — name, email, note | the notified admins | recipient's, if §1.5 is done; app default otherwise |
| "We have received your request" | applicant | applicant's, from the request |
| "Your membership request was approved — you can now sign in" | applicant | applicant's |
| "Your membership request was not approved" (may re-apply) | applicant | applicant's |
| "A member has asked to join your branch" (§7) | receiving branch's admins | recipient's |

### 5.4 Frontend

The login screen grows a "Register" path: verify email (reusing the existing OTP/OIDC machinery
verbatim) → pick a branch from `GET /auth/org/branches`, grouped by federation → name + optional note
→ submit → "request pending" screen. A returning applicant who re-verifies lands on that same pending
screen with a **Withdraw** button.

Built as `RegisterBranch.tsx`, with three states — the form, the pending request, and the one nobody
designs for: a ticket that has expired or been lost, where the only honest thing to say is "verify
your address again". Branches are grouped by federation with **WSKO** last.

---

## 6. Phase 3 — Admin UI — ✅ built

`AdminUsers.tsx` is deleted. Its flat list is replaced by navigation that follows the organization,
which also disposes of the 100-members-in-one-list problem — you are always inside a single branch:

| Route | Contents |
|---|---|
| `/admin/organization` | The tree. Create/rename federations and branches, move branches. Rendered from `GET /auth/admin/org`, so a branch admin simply sees one node. Branches in no federation sit under a **WSKO** heading; that label is a proper noun like every other organization name, so it is a constant in the frontend rather than an entry in `translations.json` |
| `/admin/branches/:id/members` | One branch's members, with a name/email filter |
| `/admin/requests` | Pending join requests across the caller's scopes, with approve/deny |
| `/admin/users/:id` | One user: display name, linked identities, roles (grantable within the caller's scope), force-logout |

The menu gate is split in two: the organizational pages are offered to anybody holding a scoped
role, while `/broadcast` stays on `admin` alone — a technical power rather than an organizational
one, and the persistence service checks for exactly that role. Each page re-checks its own scope,
and the backend enforces independently, as today.

The menu carries the **pending-request count** — a request nobody notices is a request that rots.
It is fetched once when an admin's session settles, and corrected by the queue page, which is the
one place that knows the true figure.

Built as `AdminOrganization.tsx`, `AdminBranchMembers.tsx`, `AdminUser.tsx` and `AdminRequests.tsx`,
with `roles.ts` reading the role vocabulary the same way the server does. Two endpoints were added
underneath them: `GET /auth/admin/users/{id}` and `GET /auth/admin/branches/{id}/members`, so a page
addressed by URL stands up on its own and a branch's members do not arrive by filtering everybody.

Roles are granted from `/admin/users/:id`, each switch offered where the caller's own roles cover the
scope that role confers. A role held from further up is shown as held but not as something to switch
off — offering a control the server would refuse is worse than offering none. This is where the
`admin`/`wsko_admin` hole in the Status section was found.

---

## 7. Phase 4 — Branch transfers — ✅ built

Members move to other towns; this is the most common real-world operation and the reason "change a
user's branch" is deliberately absent from Phase 1's endpoints.

**The member initiates their own transfer**, which is both the truth (the kenshi is the one who
moved) and a large simplification: no sending-branch handshake to design, no way for a member to be
stranded by an old club that never replies. The receiving branch's admins decide; the old branch is
notified of the outcome, not asked for permission.

```go
type TransferRequest struct {
    ID           string // UUID
    UserID       string
    FromBranchID string
    ToBranchID   string // partition key
    Note         string
    Status       string // "pending" | "accepted" | "rejected"
    ...
}
```

One pending transfer per user at a time. Acceptance sets `user.BranchID` and mails the member and
both branches' admins. The member's token carries the old branch for up to an hour afterwards, which
is harmless — or can be cut short by revoking their refresh tokens, reusing the force-logout
machinery.

Structurally this is the join-request flow with a different source of truth for identity (an
authenticated member rather than a join ticket), so it reuses the notification fan-out and the
approve/deny UI from Phase 2 almost wholesale.

**As built**, three things settled differently from the sketch above:

- **The request is keyed by the member's user id**, not a UUID of its own. "One pending transfer per
  member" is then structural rather than a rule somebody has to remember, and "do I have one?" is a
  point read — exactly the trade `joinrequests` makes, for exactly the same reason. Nothing about the
  member is stored on it beyond that id: their name, address and language live on the user record,
  which is a point read away and cannot go stale against itself.
- **A refusal is kept for ninety days and then leaves on its own**, the way a denied application
  does, so asking again arrives with its history. The member can clear it themselves at any time —
  there is no reason to make somebody live with the record of being told no.
- **The branch being left is read at acceptance**, not taken from the request. If an admin moved the
  member while it waited, the club that actually loses somebody is that one.

The admin side is not a second queue: transfers appear under their own heading on `/admin/requests`,
because an admin has one list of people waiting on them rather than two. The member side is
`/branch` — where they train, and the one thing they can do about it.

The moved member's token still names the old branch for up to an hour. That is left to expire rather
than revoking their sessions: nothing in the app turns on it that they could not do anyway, and
forcing somebody off every device over a piece of good news is a poor trade.

---

## 8. Shipping

Nothing reaches staging or prod until all four phases are finished, for the reason given in the
decisions: Phase 1 on its own would leave enrollment minting branchless users in the one environment
where that is expensive. The whole feature lands in a single deploy.

The order, staging first and then prod:

1. Apply the two indexing-policy changes out-of-band — `users` gains `/branchId`, `roles` goes
   `none` → `consistent`. **Before** the code that queries them is live, because `ProvisionCosmos`
   skips containers that already exist and will not do it on the way past.
2. Deploy. `ProvisionCosmos` creates `organizations` and `joinrequests` on startup.
3. Run the migration tool (§4.3) — by then, the same tool that has been seeding local data dirs
   for the whole of development.
4. Grant the first scoped roles. This is the only grant that has to come from a global admin;
   everything after it delegates downwards.

Staging exists to rehearse exactly this sequence, which is the argument for running it there first
rather than treating it as a second production.

**Where this stands: step 0 of 4.** Everything built so far runs on file-based stores and has been
exercised there — the migration tool has seeded every local data dir since it existed, dry run then
apply then re-apply. No Cosmos account has been touched, and the branch is not pushed.

---

## 9. GDPR — ✅ done

Both documents now describe what the stores actually hold. The register in BACKEND.md gained the
rows below, and `PrivacyPolicy.tsx` gained a section on applicants — who are not users yet — and
one on who can see what.

The policy also needed a correction rather than an addition: it said no other user could see
anything about you, which stopped being true the moment branches got administrators. It now says
plainly that the administrators of your branch, your federation and the organization can see your
name, address and sign-in method, that this is what running a membership requires, and that an
administrator of another branch cannot see you at all.

| Data | Where | Lawful basis | Retention |
|---|---|---|---|
| Branch membership | `users` container | Contract (account function) | Life of the account |
| Join request (email, name, free-text note, chosen branch, provider identity) | `joinrequests` | Consent (the applicant submits it) | Deleted on approval; expires 90 days after denial; withdrawable by the applicant at any time while pending |

That combination answers erasure without a dedicated request path: an applicant can withdraw a
pending request themselves, a denied one expires on its own, and an approved one is superseded by the
user record — which the existing "Delete my account" flow already erases. The Privacy Policy needs a
short pre-account section, since it currently only describes authenticated users.

---

## 10. Documentation

- ✅ **BACKEND.md** — the `organizations` and `joinrequests` containers, the two indexing-policy
  changes and their out-of-band caveat, the scoped-role vocabulary and the one rule that does not
  follow from scope, the `branch`/`fed` claims, and every endpoint added by phases 1 to 3. Still
  owed: an admission flow diagram.
- ✅ **README.md** — the role table and the covering rule, with its `admin` exception.
- ✅ **AGENTS.md** — the covering rule and its one exception, and the fact that organization names are
  never translated (WSKO being the frontend constant it is).
