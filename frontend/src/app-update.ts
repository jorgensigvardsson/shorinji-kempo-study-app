import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// The build this bundle was made from. vite.config.ts writes the same value to
// /version.json, so the two disagreeing means the server has moved on without us.
const runningVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) || 'dev';

// How long to give the waiting worker to take over before reloading anyway. The
// handover is a message to a worker that is very likely not running, and iOS in
// particular will not always start one to deliver it — so `controllerchange` can
// simply never arrive, and without this the tap looks ignored.
const HandoverTimeoutMs = 4000;

// How long to wait for a worker to finish installing after asking for one.
const InstallTimeoutMs = 20000;

// The service worker re-checks on this interval while the app stays open. A phone
// suspends the timer as soon as the app is backgrounded, which is why coming back
// into view checks as well.
const UpdateCheckIntervalMs = 60 * 60 * 1000;

// Returning to the app checks the server, throttled only enough that switching
// back and forth between apps cannot turn into a burst of requests. Short, because
// opening the app after the new-version notification is the single moment where
// being right about the current build matters most, and the answer is 40 bytes.
const ResumeCheckIntervalMs = 60 * 1000;

// How many times one session may try the polite handover before concluding the
// service worker will not hand over at all. Session-scoped on purpose: closing and
// reopening the app always starts again from the gentlest option.
const MaxHandoverAttempts = 2;
const HandoverAttemptsKey = 'app-update-handover-attempts';
const ResetDoneKey = 'app-update-reset-done';

// sessionStorage throws outright in some privacy modes, and failed bookkeeping must
// never be what stops the app updating. Losing the count only costs a further polite
// attempt before the same escalation happens anyway.
const readSession = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeSession = (key: string, value: string): void => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // See above.
  }
};

const readAttempts = (): number => Number(readSession(HandoverAttemptsKey) ?? '0') || 0;

const recordAttempt = (): number => {
  const next = readAttempts() + 1;
  writeSession(HandoverAttemptsKey, String(next));
  return next;
};

const clearAttempts = (): void => writeSession(HandoverAttemptsKey, '0');

// Which build the server is currently serving, or null if it could not be asked.
// Deliberately not routed through the service worker: version.json is outside the
// precache and fetched no-store, so a worker serving an old app cannot answer this
// with its own stale idea of the truth. null means "no answer" — being offline is
// not evidence of being out of date, and must never be treated as such.
export async function fetchDeployedVersion(): Promise<string | null> {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const version = (body as { version?: unknown } | null)?.version;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

// Tears the installation down to nothing and reloads: every worker unregistered,
// every cache deleted. This is the way out of a service worker that is serving an
// old build and will not hand over — a state that otherwise needs the user to find
// "clear site data" by hand, in a browser that, once the app is installed to a home
// screen, may not offer them any way to do it at all.
//
// Only the HTTP-response caches go. localStorage and IndexedDB are untouched, so
// settings and study data survive, and the app is offline-capable again as soon as
// the fresh worker has installed.
export async function resetAppInstallation(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
    }
  } catch {
    // A partial teardown still beats none: keep going, and reload regardless.
  }
  try {
    if ('caches' in globalThis) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
  } catch {
    // As above.
  }
  // With no worker and no caches left, this navigation reaches the network.
  window.location.reload();
}

// Asks the server for a new worker and waits for one to be ready to take over.
// Resolves to null when nothing turns up: offline, already up to date, or an install
// that failed — a precache entry that 404s because the deploy it belongs to has been
// replaced will do it, and leaves the worker `redundant` rather than waiting.
async function findWaitingBuild(registration: ServiceWorkerRegistration): Promise<ServiceWorker | null> {
  try {
    await registration.update();
  } catch {
    return registration.waiting ?? null;
  }
  if (registration.waiting) return registration.waiting;

  const installing = registration.installing;
  if (!installing) return null;

  return await new Promise<ServiceWorker | null>(resolve => {
    const finish = (result: ServiceWorker | null) => {
      installing.removeEventListener('statechange', onStateChange);
      window.clearTimeout(timer);
      resolve(result);
    };
    const onStateChange = () => {
      if (installing.state === 'installed') finish(registration.waiting ?? installing);
      else if (installing.state === 'redundant') finish(null);
    };
    const timer = window.setTimeout(() => finish(registration.waiting ?? null), InstallTimeoutMs);
    installing.addEventListener('statechange', onStateChange);
  });
}

// Hands control to a waiting worker and reloads once it has taken over — or once it
// has become clear that it is not going to.
function handOverTo(waiting: ServiceWorker): void {
  let reloaded = false;
  const reload = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
  waiting.postMessage({ type: 'SKIP_WAITING' });
  // The listener above is the normal path. This is for when the message never
  // reaches the worker at all, so the controller never changes and the reload that
  // was supposed to follow never comes.
  window.setTimeout(reload, HandoverTimeoutMs);
}

// Service-worker update handling. Registration and pending-version detection run at
// the top of App, so they are active regardless of auth state. When `autoApply` is
// set (an unauthenticated visitor, e.g. on the login screen) a pending version is
// taken immediately and silently — there is no in-progress work to protect. In-app
// users get `needRefresh` instead, surfaced as the "Update" toast, so a new version
// never interrupts them mid-task.
export function useAppUpdate(autoApply: boolean) {
  // Two independent reasons to offer an update, tracked separately so that neither
  // can quietly cancel out the other: the worker has a build ready to install, and
  // the server is serving a build this one is not. The second is what still answers
  // when the worker has stopped being able to report the first.
  const [buildWaiting, setBuildWaiting] = useState(false);
  const [serverAhead, setServerAhead] = useState(false);
  const [updating, setUpdating] = useState(false);
  const needRefresh = buildWaiting || serverAhead;

  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const watchedWaitingRef = useRef<ServiceWorker | null>(null);
  const updatingRef = useRef(false);
  const lastCheckRef = useRef(0);

  // A waiting worker can die without anyone being told: the system evicts it while
  // the app is in the background, a newer build supersedes it, or its install fails
  // after the fact. Left alone the prompt outlives the worker and its button is
  // wired to something that no longer exists — which is precisely how an install
  // ends up stuck on an old version behind a button that does nothing.
  const syncWaitingState = useCallback(() => {
    const registration = registrationRef.current;
    if (!registration) return;
    const waiting = registration.waiting;
    setBuildWaiting(Boolean(waiting));
    if (!waiting || watchedWaitingRef.current === waiting) return;

    watchedWaitingRef.current = waiting;
    waiting.addEventListener('statechange', () => {
      // Still installed means still waiting to be taken; anything else means this
      // worker has left the waiting slot, one way or another.
      if (waiting.state === 'installed') return;
      watchedWaitingRef.current = null;
      setBuildWaiting(Boolean(registrationRef.current?.waiting));
    });
  }, []);

  // Gets this device onto the newest build, escalating until something works: take
  // the build that is already waiting; failing that go and fetch one; failing that
  // clear the installation out and start over. No path through here leaves a user
  // tapping a button that does nothing.
  //
  // `automatic` marks the unprompted call made for signed-out visitors. It is held
  // to a stricter rule than a tap: it may hand over and it may tear the install
  // down once, but it may never fall back to a bare reload. Nothing decides to run
  // it again after a reload except the same condition that ran it the first time,
  // so a blind reload there is not a retry — it is a loop, in an installed app,
  // with no address bar to escape from.
  const takeLatestBuild = useCallback(async (automatic = false) => {
    if (updatingRef.current) return;
    updatingRef.current = true;
    setUpdating(true);

    const standDown = () => {
      updatingRef.current = false;
      setUpdating(false);
    };

    // Everything else has been tried. Clear the installation out — but only once
    // per session: if a torn-down install comes back still unable to update, the
    // problem is not one more reload, and repeating it is strictly worse.
    const lastResort = async () => {
      if (readSession(ResetDoneKey) !== 'true') {
        writeSession(ResetDoneKey, 'true');
        await resetAppInstallation();
      } else if (automatic) {
        standDown();
      } else {
        window.location.reload();
      }
    };

    if (recordAttempt() > MaxHandoverAttempts) {
      await lastResort();
      return;
    }

    const registration = registrationRef.current;
    const waiting = registration?.waiting ?? (registration ? await findWaitingBuild(registration) : null);
    if (!waiting) {
      // Nothing to hand over to. Either the worker cannot produce a build — the case
      // that needs clearing out — or there is no update after all, and a tap deserves
      // a reload for its trouble while the automatic caller should just let it go.
      if (serverAhead) await lastResort();
      else if (automatic) standDown();
      else window.location.reload();
      return;
    }

    handOverTo(waiting);
    // `updating` is deliberately left set: the handover ends in a reload either way,
    // and re-enabling the button in the moments before the page goes away only
    // invites a second tap to race the first.
  }, [serverAhead]);

  useRegisterSW({
    onNeedRefresh() {
      // Fires before onRegisteredSW when a build was already waiting at startup, so
      // this cannot go via syncWaitingState — there is no registration to read yet.
      setBuildWaiting(true);
    },
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration;
      syncWaitingState();
    },
  });

  // Asks both sources whether there is something newer: the worker, and the server
  // directly. The second is the one that still answers when the first cannot.
  const checkForUpdate = useCallback(async () => {
    lastCheckRef.current = Date.now();
    const registration = registrationRef.current;
    if (registration) {
      try {
        await registration.update();
      } catch {
        // Offline, most likely. The version check below decides on its own.
      }
      syncWaitingState();
    }
    const deployed = await fetchDeployedVersion();
    if (deployed === null) return; // No answer is not the same as being out of date.
    setServerAhead(deployed !== runningVersion);
    if (deployed === runningVersion) clearAttempts();
  }, [syncWaitingState]);

  // Check on load, then hourly for as long as the app stays open.
  useEffect(() => {
    // set-state-in-effect cannot see across an await: every setState in
    // checkForUpdate happens in a promise continuation, after the network has
    // answered, which is the subscription-callback shape the rule is asking for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void checkForUpdate();
    const timer = window.setInterval(() => void checkForUpdate(), UpdateCheckIntervalMs);
    return () => window.clearInterval(timer);
  }, [checkForUpdate]);

  // Returning to a backgrounded app is the likeliest moment for a build to have
  // arrived unnoticed, and on a phone it is very nearly the only one: the interval
  // above is suspended for the whole time the app is off screen.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      syncWaitingState();
      if (Date.now() - lastCheckRef.current >= ResumeCheckIntervalMs) void checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [checkForUpdate, syncWaitingState]);

  // This session already tried to hand over and the app is still running the old
  // build, so the handover did not work and offering it again would only repeat it.
  // Clear the installation out instead — once. If a torn-down install still comes
  // back stale then something is wrong that reloading cannot fix, and looping on it
  // would be far worse than leaving the prompt up.
  useEffect(() => {
    if (!serverAhead || updatingRef.current) return;
    if (readAttempts() === 0 || readSession(ResetDoneKey) === 'true') return;
    writeSession(ResetDoneKey, 'true');
    void resetAppInstallation();
  }, [serverAhead]);

  // Unauthenticated visitors (e.g. the login screen) have no in-progress work to
  // protect, so a pending version is taken immediately and silently — no toast.
  // This covers both a fresh load with a version already waiting and logging out
  // while one is pending.
  useEffect(() => {
    // The one synchronous setState down this path sets the toast button's label,
    // which nothing on the login screen renders — and the page is about to reload
    // regardless. A cascading render is not a risk here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoApply && needRefresh) void takeLatestBuild(true);
  }, [autoApply, needRefresh, takeLatestBuild]);

  // The "Update" toast button.
  const applyUpdate = useCallback(() => void takeLatestBuild(), [takeLatestBuild]);

  // Used when syncing has stopped because this build is too old to write safely,
  // where waiting for the usual prompt is not good enough. Same escalation.
  const reloadIntoLatest = useCallback(() => void takeLatestBuild(), [takeLatestBuild]);

  return { needRefresh, updating, applyUpdate, reloadIntoLatest };
}
