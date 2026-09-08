import { useEffect } from "react";
import { ApplicationInsights, SeverityLevel, type ITelemetryItem } from "@microsoft/applicationinsights-web";
import { getSyncManager } from "./sync/manager";

// Usage telemetry, deliberately kept to a handful of events.
//
// This is an experiment: the question it exists to answer is how much Application
// Insights actually ingests for an app this size, so the cost of keeping it can be
// judged against a real number rather than a guess. Everything here is biased
// towards sending as little as possible.
//
// It is also the one telemetry route that wakes nothing. The browser posts straight
// to the ingestion endpoint, so neither the auth nor the persistence container is
// disturbed — which was the objection that sank doing this in the backend, where
// the endpoint would have woken a container that otherwise sleeps for an hour at a
// time.
//
// What is never sent: no user id, no email, no display name, no raw user agent, no
// page or route. The only identifier is a hash of the user id — see usageId, which
// explains why a hash suffices here and would not if the input were an address.
//
// Nothing is bundled unless it is switched on. VITE_APPINSIGHTS_CONNECTION_STRING
// is a build-time constant, so where it is absent the guard in getClient folds to a
// constant and the entire SDK is dead-code-eliminated: a build without telemetry
// carries none of it, not merely a disabled copy of it.

const connectionString = import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING as string | undefined;
const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) || "dev";

// At most one usage event an hour per device, whatever the app does in between.
// This is the main lever on cost, and it is deliberately coarse: an hourly grain
// still answers how many people use the app, how often, on what and on which build,
// and the difference between "opened it at 19:10" and "19:40" was never a question
// worth paying to answer. It bounds the worst case — somebody who leaves the app
// open all day costs 24 events; somebody who checks it twice costs 2.
//
// It governs the usage event alone. The update event below is throttled by how
// often we deploy, which is our business rather than the user's, and exceptions are
// throttled by identity for the reasons given there.
const UsageEventGapMs = 60 * 60 * 1000;
const LastUsageKey = "usage-telemetry-last-sent";
const LastVersionKey = "usage-telemetry-last-version";

// Exceptions are throttled by identity, not by the clock, because the clock is the
// wrong instrument for them. A render loop throws thousands of times a second: an
// hourly gate would report one of those and silently hide that there were
// thousands, which is the most important thing about it. So each *distinct* problem
// is reported at most once an hour and carries how many times it actually happened
// — a crash loop costs one event and still tells you it was a loop.
//
// The cap is the other half of the bargain: a page failing in many different ways
// could otherwise clear the identity gate repeatedly, so only this many distinct
// problems are reported per hour and the rest are counted in silence.
const ExceptionGapMs = 60 * 60 * 1000;
const MaxDistinctExceptionsPerHour = 3;
const ExceptionStateKey = "usage-telemetry-exceptions";

// An error message can contain whatever the failing code was holding, which may be
// something the user typed. Truncating is no substitute for not logging secrets,
// but it bounds the payload and the blast radius together.
const MaxMessageLength = 200;
const MaxStackFrames = 5;

// Marks the items this module produced. Checked by the allow-list initializer and
// deleted there, so it gates what is sent without ever being sent itself.
const Marker = "__explicit";

let client: ApplicationInsights | null = null;
let initialized = false;

function getClient(): ApplicationInsights | null {
  if (!connectionString) return null;
  if (initialized) return client;
  initialized = true;
  try {
    const ai = new ApplicationInsights({
      config: {
        connectionString,

        // Every form of automatic collection, off. Left on, the SDK reports each
        // fetch as a dependency and each route change as a page view, which for an
        // app that syncs on every resume is a great deal of telemetry nobody asked
        // for and all of it billable.
        disableAjaxTracking: true,
        disableFetchTracking: true,
        disableExceptionTracking: true,
        enableAutoRouteTracking: false,
        autoTrackPageVisitTime: false,

        // No cookies and no storage: nothing of the SDK's own is left on the
        // device. The cost is that its built-in user and session ids are
        // regenerated every load and are meaningless — which is why the pseudonym
        // below is sent explicitly rather than relying on them.
        disableCookiesUsage: true,
        isStorageUseDisabled: true,
      },
    });
    ai.loadAppInsights();
    // Deliberately no trackPageView() call: the SDK sends one only when asked.

    // The safety net, and the reason the settings above are belt as well as
    // braces. Configuration is a statement of intent that a future upgrade or an
    // absent-minded edit can quietly reverse; this is a statement of fact about
    // what leaves the device. Anything this module did not produce is dropped
    // here, whatever turned it on.
    //
    // The marker is removed rather than merely checked, so the mechanism costs
    // nothing on the wire — an extra property on every event is precisely the kind
    // of per-event overhead this whole file exists to avoid.
    ai.addTelemetryInitializer((item: ITelemetryItem) => {
      const properties = item.baseData?.properties as Record<string, unknown> | undefined;
      if (properties?.[Marker] !== true) return false;
      delete properties[Marker];
      return true;
    });

    client = ai;
  } catch {
    // A misconfigured connection string must not take the app down with it.
    client = null;
  }
  return client;
}

// A stable, non-reversible identifier for one person — the same on their phone as
// on their laptop, so a unique-user count counts people rather than devices.
//
// A plain hash is enough here only because the input is a v4 UUID: 122 bits of
// randomness cannot be guessed and re-hashed, so holding the output tells you
// nothing without already holding the input. The same trick on an email address
// would be worthless — addresses are guessable, and a dictionary would reverse it
// in seconds. If this ever stops hashing the user id, it needs a secret key and a
// server to keep it in.
async function usageId(userId: string): Promise<string> {
  const data = new TextEncoder().encode(`shorinji-kempo/usage/v1:${userId}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Whether the app is running installed or in a browser tab. Both checks are needed:
// matchMedia covers Android and desktop, while an iOS app added to the home screen
// only ever admits it through the legacy navigator.standalone. Miss the second and
// every iPhone counts as a browser — which, given that installed iPhones are the
// population this began with, would be the wrong half to lose.
function displayMode(): string {
  const matches = (query: string) => window.matchMedia?.(query).matches === true;
  const installed =
    matches("(display-mode: standalone)") ||
    matches("(display-mode: fullscreen)") ||
    matches("(display-mode: minimal-ui)") ||
    matches("(display-mode: window-controls-overlay)") ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return installed ? "standalone" : "browser";
}

// localStorage throws outright in some privacy modes. Failing to read the clock
// costs an extra event, which is a far smaller problem than an exception on load —
// particularly in the function whose job is reporting exceptions.
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // See above.
  }
}

function dueForUsageEvent(): boolean {
  const last = Number(readStored(LastUsageKey) ?? "0");
  if (Number.isFinite(last) && Date.now() - last < UsageEventGapMs) return false;
  writeStored(LastUsageKey, String(Date.now()));
  return true;
}

// Sends an item, tagged so the allow-list above lets it through.
function send(fn: (properties: Record<string, unknown>) => void): void {
  fn({ [Marker]: true });
}

// ── usage and updates ──────────────────────────────────────────────────────────

function lastSeenVersion(): string | null {
  return readStored(LastVersionKey);
}

// Records that the app is being used, and separately that it has changed build.
//
//   "usage"   — at most once an hour per device. Answers how many people use the
//               app and how often. Three properties: who (as a hash), which build,
//               and installed or not.
//
//   "updated" — only when this device comes back running a different build than it
//               left on, so its volume is one per deploy per device rather than
//               anything per hour. It is what the stuck-update incident had no way
//               to show: which devices actually crossed from one build to the next,
//               how long they took, and which never arrived.
//
// The browser and operating system are absent from both on purpose. Application
// Insights derives client_Browser and client_OS from the request's own headers at
// ingestion, so sending a user agent would pay twice for one answer, and pay in the
// currency of a fingerprint.
export function recordUsage(): void {
  const ai = getClient();
  if (!ai) return;

  const userId = getSyncManager().getBackendUserInfo()?.id;
  if (!userId) return; // Signed out: nobody to count, and nothing worth counting.

  const previous = lastSeenVersion();
  writeStored(LastVersionKey, appVersion);

  // No previous build means this device has never been here before. That is an
  // installation, not an update, and reporting it as one would put a phantom step
  // at the start of every device's history.
  const upgradedFrom = previous && previous !== appVersion ? previous : null;
  const due = dueForUsageEvent();
  if (!upgradedFrom && !due) return;

  void usageId(userId)
    .then(uid => {
      const mode = displayMode();
      if (upgradedFrom) {
        send(properties => ai.trackEvent({
          name: "updated",
          properties: { ...properties, uid, from: upgradedFrom, to: appVersion, mode },
        }));
      }
      if (due) {
        send(properties => ai.trackEvent({
          name: "usage",
          properties: { ...properties, uid, ver: appVersion, mode },
        }));
      }
    })
    .catch(() => {
      // Web Crypto is unavailable outside a secure context. No identifier, no
      // event: an unattributable count is worse than an absent one.
    });
}

// ── exceptions ─────────────────────────────────────────────────────────────────

// How many times each distinct problem has been seen since this page loaded, so a
// report can say "this happened 4000 times" rather than arriving 4000 times.
const seenCounts = new Map<string, number>();

type ExceptionState = Record<string, number>; // signature → when it was last reported

function readExceptionState(): ExceptionState {
  try {
    const parsed: unknown = JSON.parse(readStored(ExceptionStateKey) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? parsed as ExceptionState : {};
  } catch {
    return {};
  }
}

// What makes two failures "the same problem": the kind of error, what it said, and
// where it came from. Deliberately not the whole stack — one frame is enough to
// separate distinct faults, and using more would make a report unique whenever an
// unrelated caller changed.
function signatureOf(error: Error, context: string): string {
  const frame = (error.stack ?? "").split("\n")[1]?.trim() ?? "";
  return `${context}|${error.name}|${(error.message ?? "").slice(0, 80)}|${frame}`;
}

// Records an exception, at most once an hour per distinct problem, carrying how many
// times it has happened since the page loaded.
//
// Never throws. Everything it touches — storage, crypto, the SDK — can fail, and a
// failure in the reporting of a crash must not become a second crash.
export function recordException(error: unknown, context: string): void {
  try {
    const ai = getClient();
    if (!ai) return;

    const actual = error instanceof Error ? error : new Error(String(error));
    const signature = signatureOf(actual, context);
    const count = (seenCounts.get(signature) ?? 0) + 1;
    seenCounts.set(signature, count);

    const now = Date.now();
    const state = readExceptionState();
    const lastReported = state[signature] ?? 0;
    if (now - lastReported < ExceptionGapMs) return;

    // The cap applies only to problems not already being reported, so a recurring
    // fault keeps its slot rather than being crowded out by a burst of new ones.
    const activeCount = Object.values(state).filter(at => now - at < ExceptionGapMs).length;
    if (lastReported === 0 && activeCount >= MaxDistinctExceptionsPerHour) return;

    const pruned: ExceptionState = { [signature]: now };
    for (const [key, at] of Object.entries(state)) {
      if (key !== signature && now - at < ExceptionGapMs) pruned[key] = at;
    }
    writeStored(ExceptionStateKey, JSON.stringify(pruned));

    const userId = getSyncManager().getBackendUserInfo()?.id;
    const report = (uid: string | null) => {
      // A synthetic error, so message and stack are bounded before the SDK
      // serializes them. The real one may carry a great deal of both.
      const trimmed = new Error((actual.message ?? "").slice(0, MaxMessageLength));
      trimmed.name = actual.name;
      trimmed.stack = (actual.stack ?? "").split("\n").slice(0, MaxStackFrames + 1).join("\n");
      send(properties => ai.trackException({
        exception: trimmed,
        severityLevel: SeverityLevel.Error,
        properties: {
          ...properties, where: context, count, ver: appVersion, mode: displayMode(),
          ...(uid ? { uid } : {}),
        },
      }));
    };

    // An exception is worth reporting whether or not anybody is signed in — a crash
    // on the login screen is exactly the one nobody would otherwise hear about.
    if (!userId) {
      report(null);
      return;
    }
    void usageId(userId).then(report).catch(() => report(null));
  } catch {
    // Reporting a failure must never itself fail loudly.
  }
}

// ── wiring ─────────────────────────────────────────────────────────────────────

// Fires on load and whenever the app comes back into view, which on a phone is very
// nearly the only moment anything happens at all — the app is suspended for the
// whole time it is off screen. recordUsage does the throttling, so however often
// this fires, at most one usage event an hour leaves the device.
//
// Also installs the global handlers for the two kinds of failure that otherwise
// vanish without trace: an uncaught error, and a promise nobody caught. React
// render crashes come in separately, through ErrorBoundary.
export function useUsageTelemetry(): void {
  useEffect(() => {
    recordUsage();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") recordUsage();
    };
    const onError = (event: ErrorEvent) => recordException(event.error ?? event.message, "window");
    const onRejection = (event: PromiseRejectionEvent) => recordException(event.reason, "promise");

    // The call above usually finds no user id to report. The account is read from
    // localStorage, and on the first load after signing in — or after any upgrade
    // that adds a field to what is cached there — it is not populated until
    // /auth/me has answered, which happens after this component has mounted. Left
    // at that, every user would silently miss an event per upgrade, and the
    // measurement most distorted would be which devices took a new build: exactly
    // what this was built to see.
    //
    // So the sync state is watched too. recordUsage does its own throttling, so
    // subscribing to something that changes several times a settling session costs
    // nothing: at most one usage event an hour still leaves the device.
    const unsubscribe = getSyncManager().subscribe(() => recordUsage());

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
}
