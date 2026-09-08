# Application Insights experiment

Staging only, on the `app-insights-experiment` branch. The question it exists to
answer is what this actually costs — not whether it works, which was never in doubt.

Resource: `sk-study-app-staging-insights` (resource group `sk-study-app-staging`),
workspace-based, pointing at staging's own Log Analytics workspace so it cannot
disturb production's logs or compete for production's ingestion cap.

## What is collected

Every automatic collector is off, and a telemetry initializer drops anything the
app did not explicitly produce. Three events, from `frontend/src/telemetry.ts`:

| event | when | volume |
| --- | --- | --- |
| `usage` | app opened or resumed | at most one per hour per device |
| `updated` | device comes back on a different build | one per deploy per device |
| `exception` | uncaught error, unhandled rejection, or render crash | one per distinct problem per hour, max 3, carrying a `count` |

Custom dimensions: `uid` (hash of the user id), `ver`, `mode` (`standalone` or
`browser`), plus `from`/`to` on updates and `where`/`count` on exceptions.

`client_Browser`, `client_OS` and geography are derived by Azure at ingestion from
the request's own headers — they are not sent by the app, and cost nothing.

Nothing personal is sent: no user id, no email, no display name, no raw user agent,
no route.

## Measuring the cost

This is the point of the exercise. Use staging normally for a few days first —
open it on a phone, install it to a home screen, use a browser tab, let a deploy
land — then run these in the App Insights resource's Logs blade.

**Bytes actually billed, per event type.** `_BilledSize` is the number Azure
charges on, so this is the answer rather than an approximation of it:

```kql
union customEvents, exceptions
| where timestamp > ago(7d)
| summarize events = count(),
            totalBytes = sum(_BilledSize),
            bytesPerEvent = avg(_BilledSize)
  by itemType, name
| order by totalBytes desc
```

**Projecting to a real population.** Multiply `bytesPerEvent` above by the events
a fleet would produce: one `usage` per active hour per device, plus one `updated`
per device per deploy. A member who opens the app twice a day costs two events;
one who leaves it open all day costs at most 24.

```kql
customEvents
| where timestamp > ago(7d)
| summarize eventsPerDevicePerDay = count() / dcount(tostring(customDimensions.uid)) / 7.0
```

**Daily ingestion against the cap** (the component's cap is 1 GB/day, a backstop
rather than a budget):

```kql
union customEvents, exceptions
| where timestamp > ago(30d)
| summarize MB = sum(_BilledSize) / 1024.0 / 1024.0 by bin(timestamp, 1d)
| render timechart
```

## The questions this was built to answer

**How many unique people, and how often.** `uid` is stable per person across every
device and browser they use, so this counts people rather than installations:

```kql
customEvents
| where name == "usage"
| summarize people = dcount(tostring(customDimensions.uid)),
            sessions = count()
  by bin(timestamp, 1d)
| render timechart
```

**Installed app or browser tab:**

```kql
customEvents
| where name == "usage"
| summarize people = dcount(tostring(customDimensions.uid))
  by mode = tostring(customDimensions.mode)
```

**Which browsers and platforms** (derived by Azure, not sent by the app):

```kql
customEvents
| where name == "usage"
| summarize people = dcount(tostring(customDimensions.uid))
  by client_Browser, client_OS
| order by people desc
```

**Which build everyone is on** — the query that would have found the stranded
phone. Anyone still reporting an old `ver` days after a deploy has not updated:

```kql
customEvents
| where name == "usage" and timestamp > ago(2d)
| summarize devices = dcount(tostring(customDimensions.uid)),
            lastSeen = max(timestamp)
  by build = tostring(customDimensions.ver)
| order by lastSeen desc
```

**How a release actually rolled out** — how long each device took to cross:

```kql
customEvents
| where name == "updated"
| summarize devices = count() by from = tostring(customDimensions.from),
                                 to = tostring(customDimensions.to),
                                 bin(timestamp, 1h)
| render columnchart
```

**What is failing, and how badly.** `count` is how many times that exact problem
fired on that device, so a crash loop shows as one row with a large number rather
than as a flood:

```kql
exceptions
| summarize occurrences = sum(toint(customDimensions.count)),
            devices = dcount(tostring(customDimensions.uid)),
            reports = count()
  by problem = outerMessage, where_ = tostring(customDimensions.where)
| order by occurrences desc
```

## Caveats when reading the numbers

**It undercounts, and unevenly.** Ad blockers block
`*.in.applicationinsights.azure.com` by default, so some sessions never arrive —
and blocker use skews by platform and by how technical the user is. A server-side
log line cannot be blocked. Weigh this before comparing the measured cost against
what the backend approach would have cost.

**Signed-out use is invisible.** The `uid` comes from the account, so nothing is
recorded on the login screen. Exceptions are the exception: a crash with nobody
signed in is reported without a `uid`, since that is exactly the failure nobody
would otherwise hear about.

**Volume here is not volume in production.** Staging has one user. Multiply by
active members, not by registered ones.

## Turning it off

The connection string is a build-time constant, so an environment without it does
not ship a disabled SDK — the guard folds to a constant and Rollup eliminates the
package entirely. Measured: zero bytes without it, 78 KB gzipped with it. That 78 KB
is the standing cost of keeping this, and it lands on every first load.

## One-time setup this needed

Both were subscription- and tenant-level, and neither can be done by the pipeline:

- `az provider register --namespace Microsoft.Insights` — the first resource in
  that namespace. The deploy principal is resource-group-scoped and cannot register
  providers, so a fresh subscription fails with `MissingSubscriptionRegistration`
  until this is run by hand. Takes about a minute.
- A federated credential for the branch, since workload identity federation trusts
  only `main`, `deploy` and `deploy-staging`. Named
  `github-ref-app-insights-experiment`; **delete it when this experiment ends**:

  ```bash
  az ad app federated-credential delete \
    --id 45952730-6190-4610-8f21-4ce1576d919a \
    --federated-credential-id e7d3b99d-fbf3-4d57-b1e5-2b3be93b1b85
  ```
