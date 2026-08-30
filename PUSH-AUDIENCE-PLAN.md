# Push Notification Audiences — Design Plan

Give a push notification an *audience*, so that a branch admin can tell their own club about a
cancelled practice without telling every phone in WSKO. Scope the send by the same rule that already
scopes everything else organizational, and resolve who is in that audience in **two batched queries,
with no per-branch or per-user loop**.

> **"User" here means a subscriber.** Somebody who has opted in and whose subscription this service
> holds. A member with no subscription is not part of any audience and is not counted in any total —
> "sent to the whole federation" always means the devices in it that asked to hear from us. The
> distinction matters most in what the UI claims after a send (§8).

## Status

**All of it is built**, against the file-based stores — nothing here has touched staging or
production, same as the rest of `ORGANIZATION-PLAN.md`. §1 describes what push did before this;
everything below is what replaced it.

| | What | Where |
|---|---|---|
| ✅ | **Decided:** `wsko_admin` may send to `all` — it is `authz.WSKO()`, and `Covers` alone decides | §4 |
| ✅ | Startup re-register | §7 |
| ✅ | Audience as a list of scopes, `all` included | §3 |
| ✅ | Authorize every entry with `authz.Covers`; refuse the request, never an entry | §4 |
| ✅ | Batch membership resolution — two queries, and overlap deduplicated by construction | §5 |
| ✅ | Prune on 403, so a VAPID rotation cannot leave dead rows forever | §7 |
| ✅ | Frontend: no picker when the sender administers one branch | §8 |
| ✅ | Frontend: confirm any send wider than the sender's own club | §8.1 |
| ✅ | Build pipeline keeps sending to everybody, unchanged | §3.1 |

**As built, one thing settled differently from the design text below.** §4's closing note says
`isGlobalAdmin` "becomes dead code and should go." It was renamed to `isTechnicalAdmin` and kept,
per the person building this: `admin` alone is root — a technical superuser distinct from
`wsko_admin`'s organizational authority — and more admin-only technical controls (unrelated to
organizational scope) are expected to need exactly that predicate, the same way this one no longer
does. `routes.tsx`'s broadcast gate moved to `isAnyAdmin`, as the design still says; only the
retirement of the predicate itself did not happen.

Audience resolution is a new synchronous call from persistence to auth
(`POST /auth/admin/push-audience`, `backend/persistence/internal/authclient`), forwarding the
caller's own `access_token` cookie — the first such call between the two services (§5, §10). It
carries a 25 s timeout, chosen to stay under persistence's own 30 s `http.Server.WriteTimeout`
rather than reusing `jwks.Cache`'s 45 s cold-start figure, which times a background refresh rather
than a live request.

---

## §1 What exists today, and why it is perilous

`POST /push/broadcast` (`backend/persistence/internal/api/push_handlers.go:88`) does one thing:
`ListSubscriptions()`, then send to every row returned. There is no filter parameter and no filter
capability. A grep for `branch|federation|target|audience|scope` across all eight push-related files
returns nothing at all.

The absence is structural, not a missing `if`:

- **The data is not tagged.** `store.PushSubscription` holds endpoint, keys, `UserID`, and two
  timestamps. No branch, no federation, no role.
- **The store cannot be asked a question.** `PushStore` has three methods and `ListSubscriptions()`
  returns everything.
- **The persistence service is organization-blind.** No org tree, no user store, no call path to
  auth. Its `authMiddleware` parses the JWT and keeps only the `sub` claim
  (`middleware.go:72`), discarding `branch` and `fed`.
- **Authorization is binary.** `authorizeAdmin` is an exact-match `hasRole(…, "admin")`, or the
  shared `PUSH_ADMIN_TOKEN`. `authz.Covers` lives in the auth module and persistence cannot reach it.

The peril was seen and deliberately contained, on the sending side. `frontend/src/roles.ts:33`:

> The technical powers — push broadcasts above all — stay on `admin` alone: `wsko_admin` administers
> the organization, which is not the same thing as being able to notify every phone in it.

That is the right instinct and the wrong lever. It bounds *who may send* by making the feature
unusable for anything organizational: the only person who can send is the one person whose every
send goes to everybody. Bounding *who receives* is what makes the power safe to delegate.

Worth noting for the pre-ship checklist: `ORGANIZATION-PLAN.md`'s "who gets notified, and of what"
review covers the mail fan-out for join requests and transfers. It does not mention push. The one
audience question that reaches every device in the organization is the one that review does not ask.

---

## §2 What Web Push can and cannot do

Because the obvious design — a token per level, subscribers subscribing to the tokens relevant to
them — is an FCM/APNs shape that Web Push does not have, and it is better to have that written down
than rediscovered.

**There are no topics.** RFC 8030 defines a `Topic` header, but it is a *replacement* key: a new
message carrying the same topic overwrites the previous undelivered one **for that same
subscription**. It coalesces; it does not fan out.

Three separate things get called "token" here, and none of them is an audience:

| | What it identifies | Cardinality |
|---|---|---|
| VAPID key pair | the application server — *us* | one per app |
| Push subscription (endpoint + `p256dh` + `auth`) | one browser profile on one device | one per device |
| `PUSH_ADMIN_TOKEN` | a caller of the send endpoint | one shared secret |

**A per-level VAPID key cannot work**, and not merely because it is awkward: a service worker
registration holds exactly one push subscription. Subscribing again with a different
`applicationServerKey` fails unless the existing subscription is dropped first — which
`push.ts:54` already does when it detects a rotated key. Holding several subscriptions would mean a
separate service worker *scope* per level, and the level set is dynamic: branches are created at
runtime and members transfer between them, so service workers would have to be registered and
unregistered as organizational membership changed.

**So fan-out is always a server-side loop over a subscription list.** Which is the good news: the
authorization decision lands in our code, next to `authz.Covers`, rather than inside an opaque topic
namespace where scope could not be enforced at all.

---

## §3 The audience is a list of scopes

The send endpoint gains one optional field: a **list of receivers**, each of which is *all*, a
federation, or a branch, mixed freely in one send.

```json
{
  "title": "Träningen på tisdag är inställd",
  "body":  "Hallen är dubbelbokad.",
  "url":   "/",
  "audience": [
    { "kind": "federation", "id": "SE" },
    { "kind": "branch", "id": "uuid-a" },
    { "kind": "branch", "id": "uuid-b" }
  ]
}
```

**This is `authz.Scope` on the wire.** `Kind` is already exactly `wsko | federation | branch`
(`authz/scope.go`), and `ScopeOf` is already documented as *"the one validator for role input
arriving over the wire"* — it rejects an unknown kind and a scoped entry with an empty id. Reusing
the type means the audience needs no vocabulary of its own, and §4's authorization becomes a
one-liner over it.

The important consequence: **`all` is an ordinary member of the list, not a magic absence.** An
earlier draft made "everybody" mean "audience omitted", which cannot express *"my federation, plus
these two clubs elsewhere"* and cannot be authorized by the same rule as everything else. As a scope
it is just `{ "kind": "wsko" }`, and who may name it falls out of §4 like every other entry.

**An omitted audience still means `[{ "kind": "wsko" }]`.** That is what keeps the deploy
announcement working untouched — `deploy.yml:411` posts a body with no audience field, and must keep
meaning *everybody* (§3.1).

### §3.1 The build pipeline sends to all

The new-version notification is the one send that is always global, and it is sent by CI rather than
by a person: `deploy.yml:407` presents `PUSH_ADMIN_TOKEN` and posts title/body/url only.

Two rules follow, and they are the same rule seen from both ends:

- **Omission means `all`**, so the existing pipeline step needs no change at all.
- **`PUSH_ADMIN_TOKEN` can only ever resolve to `all`.** It is a shared secret carrying no identity,
  so there are no roles to check a narrower scope against. A request presenting the token and naming
  a federation or a branch must be refused rather than honoured — not because it is dangerous (`all`
  is the strictly larger power) but because it would be authorizing a scope decision with a
  credential that cannot make one.

Making the pipeline send `{"audience":[{"kind":"wsko"}]}` explicitly is optional and slightly better
for the audit trail (§9), but it is not required and is not worth touching a deploy workflow for.

---

## §4 Authorization — one rule, every combination

The caller's roles decide which receivers they may name. That is not a new rule and needs no new
vocabulary: **every entry in the audience must satisfy `authz.Covers`**, and the whole request is
refused unless all of them do.

```go
for _, scope := range audience {
    if !authz.Covers(callerRoles, scope, tree) {
        return errForbidden   // all-or-nothing: never silently drop an entry
    }
}
```

The combinations the requirement asks for are not cases in this code — they are consequences of the
covering relation, exactly as delegation is in `adminSetRoles`:

| Caller holds | May name | May not name |
|---|---|---|
| `branch_admin:B` | branch `B` | anything else — the narrowest authority there is, no view upwards |
| `branch_admin:B` + `branch_admin:C` | `B`, `C`, or both in one send | the federation above them, even if it holds only `B` and `C` |
| `federation_admin:SE` | federation `SE`; any subset of its branches; both at once | a branch in `NO`, or `all` |
| `federation_admin:SE` + `branch_admin:X` (X in `NO`) | `SE` and `X` together | `NO`, or `all` |
| `admin` / `wsko_admin` | `all`, and any federations and branches | — |

**A caller may hold several roles at different levels, and the union is what they may name.** Nothing
special is needed for that: each entry is checked against the caller's whole role set, so a
federation admin who also runs one club in another country can name both in a single send.

**Refuse the whole request, never part of it.** Silently dropping an unauthorized entry would send a
notification whose audience is not the one the sender chose, and they would have no way to tell.

**Failures must not leak existence.** Naming a branch outside the caller's scope should be refused
the way `adminBranchMembers` already refuses it — `404 branch not found` rather than `403`
(`admin.go:357`) — so that a branch admin cannot enumerate the organization by probing.

### ✅ Settled: `wsko_admin` may name `all`

**Decided.** `all` is `authz.WSKO()` and nothing more; `Covers` decides who may name it, which is
`admin` and `wsko_admin` alike. No special case, no guard by role name.

This does reverse `roles.ts:33`, which withheld broadcast from `wsko_admin` on the grounds that
*"`wsko_admin` administers the organization, which is not the same thing as being able to notify
every phone in it."* That distinction made sense when the only send was to everybody. Once a send
has an audience, authority over the root **is** the right to address the root, and keeping the two
apart would have been the special case rather than the principle. **The comment and the gate both
have to change when this is built** — see below.

### `all` is *almost* a shortcut for every federation and branch

Close enough to think of it that way, but not close enough to implement it that way. Three
differences, one of which is structural:

- **A branch can hang directly off WSKO.** `FederationID` is documented as *"empty = attached
  directly to WSKO"*, and `BranchesIn("")` returns exactly those. So "every federation" misses them,
  and `authz` agrees — a federation admin does not cover a branch attached straight to the root,
  because it *"resolve[s] to `""` and [is] therefore not covered"*. Any client-side expansion would
  have to remember to union in the root's own branches, and would silently drop a club the first
  time somebody forgot.
- **Untagged subscriptions.** A row with an empty `UserID` cannot be reached by any scoped send
  (§6). `all` reaches it, because `ListSubscriptions()` does not ask who anybody is.
- **It costs a query, and it grows.** Expanding client-side turns a one-query send into a two-query
  one (§5), needs the whole tree in the browser, and produces a list that is stale the next time a
  branch is created. `deploy.yml` could not do it at all — it has no tree and no session.

So `all` stays a first-class scope on the wire, which is what §3 already specifies. It is a
*shortcut* in the sense that matters to a person choosing receivers, and a distinct scope in the
sense that matters to the code resolving them.

### What this decision changes in the code

Pleasantly little, and it deletes more than it adds:

- `routes.tsx:215` is the **only** use of `isGlobalAdmin` in the app. §8 already replaces that gate
  with `isAnyAdmin`, and "may name `all`" inside the page is `coversEverything()` — the predicate
  `AdminOrganization.tsx:55` and `AdminUser.tsx:131` already use for exactly this question.
  **As built, `isGlobalAdmin` was renamed to `isTechnicalAdmin` and kept** rather than deleted —
  see the Status section above. It stops being *used* here, which is the asymmetry that mattered.
- `roles.ts:33`'s comment is now wrong and must be rewritten rather than left to mislead. **As
  built**, rewritten to describe `isTechnicalAdmin` as the root/technical-superuser predicate
  instead.
- Nothing changes server-side beyond §4's loop, which never had a special case to remove.

---

## §5 The send path: two queries, no loops

The expansion in §3 and the check in §4 are both **in-memory and free**: `org.Tree` is loaded at
startup and rebuilt on write, and is documented as costing 0 RU. Only two things need the database,
and each is asked exactly once no matter how many receivers the audience names — **two queries for a
scoped send, one when the audience contains `all`**, never a query per branch.

```
   admin  ──POST /push/broadcast {audience}──▶  persistence
                                                    │
                          forwards the caller's access_token cookie
                                                    ▼
                                                  auth
                                        expand federations  (in memory, 0 RU)
                                        authz.Covers × N    (in memory, 0 RU)
                                                    │
                                      ① ListByBranches(allBranchIDs)   ← ONE query
                                                    │
                                             ◀── [userIds]
                                                    │
                                      ② ListSubscriptionsForUsers(ids) ← ONE query
                                                    │
                                              send, prune, report
```

### ① Membership — one query, and the method already exists

`UserStore.ListByBranches` is already exactly the right shape, and already batched:

```go
// backend/auth/internal/store/cosmos.go:230
pager := s.users.NewQueryItemsPager(
    "SELECT * FROM c WHERE ARRAY_CONTAINS(@branchIds, c.branchId)",
    azcosmos.NewPartitionKey(), opts)
```

One cross-partition query, parameterized by the whole branch list. A federation of twelve clubs costs
the same one query as a single club.

It needs a new endpoint in front of it, because persistence cannot call `adminBranchMembers` once per
branch without becoming the loop this design exists to avoid:

```
POST /admin/push-audience   { "federations": [...], "branches": [...] }
                         →  { "userIds": [...] }
```

Auth is the right place for it: it holds the tree and the roles, so it performs the §4 check itself,
and **persistence never needs `authz` at all**. Forwarding the caller's own cookie means the scope
being enforced is the caller's, using machinery auth already has.

Returning ids rather than user records also keeps this endpoint from becoming a way to read the
membership of a branch — it answers "who would receive this", not "who are they".

### ② Subscriptions — one query, mirroring ①

One new method on `PushStore`:

```go
ListSubscriptionsForUsers(userIDs []string) ([]*PushSubscription, error)
```

```sql
SELECT * FROM c WHERE ARRAY_CONTAINS(@userIds, c.userId)
```

Deliberately the same shape as `ListByBranches`, for the same reason. The file store filters the
directory read in memory.

**An audience containing `all` skips ① entirely** and calls the existing `ListSubscriptions()` — one
query, not two, and no membership resolution, since there is no question left to ask.

It is also the only audience that does not depend on the branch invariant holding. Every member
belongs to a branch, so in a migrated system the two agree: naming every federation reaches the same
people as `all`. Before `orgmigrate` has run, or if a single account ever slips the admission gate, a
scoped send silently misses them while `all` does not — which is right for "training is cancelled"
and wrong for "new version available". That is one more reason the build pipeline's notification
stays global (§3.1) rather than being expressed as a list of federations.

**This needs no indexing change.** The `pushsubscriptions` container is created with Cosmos's
*default* indexing policy — every path indexed — precisely because broadcast already scans it
(`provision.go:80`). It is the one container in either service whose indexing is not switched off, so
a filter on `c.userId` is served by an index that is already there.

That is worth stating plainly, because it is the opposite of the two changes `ORGANIZATION-PLAN.md`
§1.2 and §1.3 still owe staging and production out-of-band. **This design adds no third one.**

### Overlapping receivers, and why nobody hears it twice

Receivers overlap the moment anyone names a federation and one of its branches, or `all` and
anything else. **No duplicate delivery is possible, and no de-duplication pass is needed** — the
pipeline is set-valued at every step, so a recipient cannot be reached twice by construction:

| Step | Why a duplicate cannot survive |
|---|---|
| scopes → branch ids | expansion accumulates into a **set**. Branch `B` named directly and again via federation `SE` is one element |
| `all` present | short-circuits: the audience is every subscription, so nothing is expanded or unioned at all |
| branch ids → user ids | `User.BranchID` is a single value — *"the one branch this practitioner belongs to"* — so one user matches at most one branch in the `ARRAY_CONTAINS`, however many branches are named |
| user ids → subscriptions | endpoint is the container's id and partition key, so each subscription is one row and is returned once |
| subscriptions → sends | one `Send` per row |

This is worth stating because it is a property of *this* design rather than of the problem. The
per-branch loop rejected in §10 would have needed an explicit dedup pass and a bug the first time
someone forgot it: a member of `B` reached once via `SE` and once via `B` would get the same
notification twice.

**One person with several devices still gets it on each of them, and that is not duplication.** A
phone and a laptop are two subscriptions, and delivering to both is the point. The guarantee is
*at most one delivery per subscription*, which is the only sense in which "duplicate" is
well-defined here.

> **Related, pre-existing, and worth knowing:** `SaveSubscription` upserts on endpoint, so a browser
> shared by two accounts holds one subscription tagged with whoever enabled notifications last. The
> earlier user stops receiving; they do not receive the later user's notifications *as well*. Not a
> dedup problem, but the same corner of the data model, and unchanged by this design.

### On the size of `@userIds`

The parameter list is bounded by the number of *users* in the audience, not the number of branches.
At the scale this app is built for — tens of federations, hundreds of branches at the very most, and
one subscription per device — a federation-wide send is a few hundred ids. That is a comfortable
query.

Two escape hatches exist before it stops being one, and neither is a loop:

- The unscoped send does not filter at all; it uses `ListSubscriptions()` as it does today.
- If a single federation ever outgrows a sane parameter list, the fallback is to denormalize
  `branchId` onto the subscription so the query parameterizes by branch count instead. §6 explains
  why that is not the starting point.

---

## §6 Membership is resolved, never denormalized

The tempting shortcut is to stamp the subscriber's branch onto the subscription at subscribe time —
the `branch` claim is right there in the token, and then §5① disappears entirely. **Do not**, and
`transfer.go:244` says why in its own words:

> Their token still says the old branch for up to an hour. Nothing in the app turns on it that a
> member could not do anyway, so it is left to expire rather than forcing them off every device over
> a piece of good news.

Tag the subscription from that claim and the sentence stops being true. A member who transfers and
re-registers within the hour is tagged to the club they **left**, and — with the startup re-register
of §7 — that wrong tag is then refreshed on every launch, indefinitely.

Resolving at send time makes the question go away rather than answering it:

| | Resolve at send (§5) | Denormalize `branchId` |
|---|---|---|
| A member transfers | nothing to do — `transfer.go:230` writes `BranchID`, the next send sees it | every subscription row for that user must be rewritten |
| Existing rows | already carry `UserID`; usable immediately | need a backfill |
| Paths that move a member | irrelevant | `transfer.go:230`, `joinrequest.go:365`, `orgmigrate` — and every future one, silently |
| Service coupling | persistence → auth, which is the direction that already exists | auth → persistence, a new inversion |
| Queries per send | 2 | 1 |

One query is not worth the other five rows. `transfer.go:230` is the only runtime path that moves an
existing member — `joinrequest.go:365` creates an account that has no subscription yet — so the
denormalized version is *nearly* safe today, and would decay the first time a second path is added.

**Subscriptions with an empty `UserID` are never targeted.** They cannot be, and should not be swept
in by a caller whose audience failed to resolve. This follows the precedent `ListByBranches` already
sets for users with no branch: *a user with no branch belongs to nobody*.

---

## §7 Existing subscriptions: can they be revoked as a migration step?

Yes — three ways, in increasing severity. **The recommendation is none of them.**

### They do not need revoking

Every existing row already carries `UserID`, and under §6 that is the whole of what a targeted send
needs. Existing subscriptions keep working, become targetable the day the feature ships, and require
no migration whatsoever. Only rows with an empty `UserID` are untargetable, and §6 excludes those by
rule.

### Truncating the store — and the trap

Deleting every row does not revoke anything client-side: the browser's subscription survives
untouched. And it cannot heal, because of how the two opt-in paths are guarded.

`subscribeToPush()` is called from exactly two places, both explicit user actions:

- the Settings toggle (`Settings.tsx:528`)
- the one-time nudge (`App.tsx:381`), which is suppressed when `getCurrentSubscription()` returns
  non-null — that is, when the **browser** still holds a subscription (`App.tsx:367`)

So after a truncation the nudge stays suppressed, Settings still reports the toggle as **on**, and
the device never re-registers. Those users stop receiving notifications permanently while the UI
tells them they are subscribed. Do not truncate without §7's re-register shipped first.

### Rotating the VAPID key pair — the real revoke

Changing `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` genuinely invalidates every subscription: the push
service binds each one to the `applicationServerKey` it was created with. The client already handles
it — `applicationServerKeyMatches` (`push.ts:116`) detects the mismatch, unsubscribes, and
re-subscribes.

Two caveats:

1. That code only runs inside `subscribeToPush()`, so rotation hits the same trap as truncation and
   needs the re-register below.
2. **`Sender.Send` prunes only on 404/410** (`sender.go:69`). A key mismatch typically returns
   **403**, which lands in `Failed` and leaves the dead row in the store forever. Treat 403 as
   prunable before rotating anything — it is a two-line change and worth making regardless.

### The prerequisite: re-register on startup

When a browser subscription exists and the user is signed in, POST it to `/push/subscribe` on app
start rather than only on opt-in.

It is small, it is independently useful — it self-heals rows lost to any cause, including a store
that was truncated or a key that was rotated — and it is what makes both destructive options
survivable. **Ship it before any migration step, not with one.**

---

## §8 Frontend — the picker appears only when there is a choice

`routes.tsx:215` gates the page on `isGlobalAdmin`; it becomes `isAnyAdmin`.

**The page shows what the sender's roles make available, and nothing else.** The candidate receivers
come from `administeredFederations()` and `administeredBranches()` (`roles.ts`) plus `all` where §4
permits it — the same helpers that already decide what `AdminOrganization.tsx:56` opens on, and they
exist for exactly this reason: *"a branch admin should land in their own branch rather than on a list
holding one item."*

| The sender administers | The page shows |
|---|---|
| **exactly one branch, nothing else** | **no picker at all** — a line stating the message goes to every subscribed member of *that* branch, named |
| one federation, nothing else | that federation preselected, with its branches offered as an optional narrowing |
| anything else | the picker, listing only what they may name |

The one-branch case is the common one and deserves to look it: a branch admin has no decision to
make, so offering them a control with a single option is asking a question with one answer. State
the destination as a fact — *"Notisen skickas till alla i Malmö Shorinji Kempo som har aktiverat
notiser"* — and let them write the message.

Everything the picker offers is enforced again in §4. A control that is merely hidden is a courtesy;
`roles.ts` says so itself, and it is the server that counts.

### §8.1 Confirm anything wider than your own club

A notification cannot be recalled, so a send that reaches beyond the sender's own club asks first.
The rule is one line, and it falls out of the same two facts the page already has:

> **Send without confirming only when the audience is exactly one branch, and that branch is the
> sender's own.** Everything else confirms: several branches, a federation, `all`, or a single branch
> the sender does not belong to.

`BackendUserInfo` already carries `branchId` alongside `roles` (`sync/backend.ts:48`), so this needs
no new plumbing — the comparison is against something the page has already loaded.

| Sender | Audience | |
|---|---|---|
| `branch_admin:B`, member of `B` | branch `B` | sends |
| `federation_admin:SE`, member of `B` | branch `B` | **confirms** — a higher tier reaching into a club they do not train at |
| `federation_admin:SE`, member of `B` | branches `B` and `C` | **confirms** — more than one club |
| `federation_admin:SE` | federation `SE` | **confirms** |
| `admin` | `all` | **confirms** |

That the no-confirm case coincides exactly with §8's no-picker case is a good sign rather than a
coincidence: the branch admin telling their own club that training is cancelled is the routine,
frequent, small-blast-radius send, and it is the only one that should feel routine.

**Every member belongs to a branch**, so the sender's own branch is always known and the exception is
always reachable. That invariant is what the admission gate exists to establish and what
`orgmigrate` back-fills; `BranchID` is documented as empty *"only until the admission gate makes a
branchless account impossible to create"*. Treat an empty `branchId` as "not my club" and confirm
anyway — it costs one dialog in a state that should not exist, and it fails in the safe direction if
it somehow does.

**Name the audience rather than warning vaguely.** *"Det här meddelandet når alla 12 klubbar i
Svenska Shorinji Kempoförbundet. Vill du skicka?"* tells the sender what they are about to do;
*"a lot of people"* asks them to guess. The branch count is available client-side — the scoped tree
is already fetched for `AdminOrganization`.

An exact recipient count would be better still and is not free: it needs the §5 resolution without
the send, so either a dry-run endpoint and a second round trip against a scale-to-zero service, or
nothing. Worth adding only if the audience description turns out not to be enough.

**This is a courtesy, not a control.** §4 decides what may be sent; §8.1 only slows down what may
already be sent, and the server neither knows nor cares whether a dialog was shown. `roles.ts` makes
the same point about hiding controls, and it applies here unchanged.

### The rest

- The menu string **"Skicka notis till alla"** has to stop saying *till alla*.
- The confirmation should name the audience, not just the count: *"Skickat till 23 mottagare i
  Malmö Shorinji Kempo"*. A send that cannot be recalled deserves to say what it did.
- **Count subscribers, not members.** *"23 mottagare"* is 23 devices that opted in, not 23
  practitioners in the club, and the copy should not let a sender infer their club ignored them.
- Auth is expected to run scaled to zero, so the audience call can be slow the first time — this page
  is one of those covered by `ORGANIZATION-PLAN.md`'s outstanding loading-indicator work.

---

## §9 What this does not solve

- **`Broadcast` is serial and synchronous inside the HTTP handler** — one HTTP round trip per
  subscription, in-request (`sender.go:93`). Scoped sends make this better rather than worse, since
  a club is thirty devices; the unscoped WSKO-wide send is the case that will eventually exceed a
  request timeout. Out of scope here, but this design does not fix it.
- **No audit trail.** `ORGANIZATION-PLAN.md` already lists audit trails as outstanding. Widening
  send authority from one person to every branch admin is exactly what turns that from a
  nice-to-have into a prerequisite: a notification cannot be recalled, and "who sent that to my
  club?" should have an answer.
- **`PUSH_ADMIN_TOKEN` remains scope-blind**, necessarily — it is a shared secret carrying no
  identity, so it authorizes `all` and nothing narrower (§3.1). That is precisely what the deploy
  announcement needs, and it means the pipeline requires no change.
- **Rate limiting.** One global admin sending rarely is self-limiting. Every branch admin in WSKO is
  not.

---

## §10 Alternatives considered

**A token or VAPID key per level.** Not possible — §2. One subscription per service worker
registration, and a dynamic level set.

**Persistence queries the `users` container directly.** Both services share one Cosmos database, so
persistence could resolve membership itself in a single query and skip the call to auth. Rejected:
it would put auth's schema and auth's scope rules into a service that has neither, and the §4 check
would have to be duplicated where it could drift. The call to auth is one query behind one endpoint,
not a loop.

**Move `authz` into `backend/shared`.** It is stdlib-only by explicit design and persistence already
depends on `shared`, so this is clean and was the first plan. It became unnecessary once auth owns
the audience endpoint: the scope check belongs where the tree and the roles already are. Worth
revisiting only if persistence ever needs a scope decision of its own.

**Per-branch calls to the existing `adminBranchMembers`.** Correct, needs no new endpoint, and is a
loop of database queries — one per branch — which is the thing this design is meant to avoid.
