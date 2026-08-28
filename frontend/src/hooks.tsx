import { useState, useEffect, useSyncExternalStore } from 'react'
import { getThemePreference, setThemePreference, subscribeThemePreference } from './persistence/theme';
import { getSyncProvider, setSyncProvider, subscribeSyncProvider, type SyncProvider } from './sync/provider';
import { getSyncManager } from './sync/manager';
import { getTranslations, subscribeTranslations } from './translations';
import { endNavigation, getPendingNavigation, subscribePendingNavigation } from './navigation-pending';
import { useLocation } from 'react-router-dom';
import type { Translations } from './i18n';
import type { SyncState } from './sync/types';

export const useDeviceSize = () => {

  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)

  const handleWindowResize = () => {
    setWidth(window.innerWidth);
    setHeight(window.innerHeight);
  }

  useEffect(() => {
    // component is mounted and window is available
    handleWindowResize();
    window.addEventListener('resize', handleWindowResize);
    // unsubscribe from the event on component unmount
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  return [width, height]
}

export const useIsDesktop = () => {
  const [width] = useDeviceSize();
  return width >= 1230;
}

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: "light" | "dark") {
  document.documentElement.setAttribute("data-bs-theme", theme);
}

export function useTheme() {
  // Read from the device rather than the synced document: a theme suits the screen
  // it is read on, not the person reading it. See persistence/theme.ts.
  const preference = useSyncExternalStore(subscribeThemePreference, getThemePreference);

  // Applying the theme is a real side effect on the document, so this effect
  // stays. What went away is the write-back that persisted the preference the
  // component had just been handed by the store.
  useEffect(() => {
    applyTheme(preference === "system" ? getSystemTheme() : preference);
  }, [preference]);

  // React to OS theme changes when in system mode
  useEffect(() => {
    if (preference !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme(getSystemTheme());

    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [preference]);

  return {
    theme: preference,
    effectiveTheme: preference === "system" ? getSystemTheme() : preference,
    setTheme: setThemePreference,
  };
}

/**
 * Holds a Screen Wake Lock while `active` is true, releasing it when `active`
 * turns false or the component unmounts. No re-acquire on visibility change:
 * the browser auto-releases the lock when the tab is hidden, and the app already
 * resets `active` to false on hide, so the user re-activates deliberately.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    navigator.wakeLock.request("screen")
      .then(s => {
        // If cleanup already ran before the request resolved, release at once.
        if (released) { void s.release().catch(() => {}); return; }
        sentinel = s;
      })
      .catch(() => {
        // Denied — e.g. battery saver, page not visible, or no permission.
      });

    return () => {
      released = true;
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}

export function useSyncProvider() {
  // Device-local rather than part of the synced document, so it has its own small
  // external store rather than going through useAppData.
  const syncProvider = useSyncExternalStore(subscribeSyncProvider, getSyncProvider);

  return {
    syncProvider,
    setSyncProvider: (provider: SyncProvider) => setSyncProvider(provider),
  };
}

export function useSyncState() {
  const manager = getSyncManager();
  const [state, setState] = useState<SyncState>(() => manager.getState());

  useEffect(() => manager.subscribe(setState), [manager]);

  return state;
}

// Runs `task` once the browser has nothing better to do, for work that should not
// compete with the first paint but should not wait for the user either — fetching a
// chunk that will be wanted shortly, most of the time. Safari has no
// requestIdleCallback, hence the timer.
export function useIdleTask(task: () => void) {
  useEffect(() => {
    const idle = window.requestIdleCallback;
    if (idle) {
      const handle = idle(() => task(), { timeout: IDLE_TASK_TIMEOUT_MS });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(task, IDLE_TASK_FALLBACK_MS);
    return () => window.clearTimeout(timer);
    // Deliberately runs once per mount: the caller passes a fresh closure on every
    // render, and re-running the task on each of them is never what is wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

const IDLE_TASK_TIMEOUT_MS = 5000;
const IDLE_TASK_FALLBACK_MS = 2000;

// The translation sections currently held. Re-renders when one arrives that was not
// loaded at startup — see translations.ts for which those are and why.
export function useTranslations(): Translations {
  return useSyncExternalStore(subscribeTranslations, getTranslations);
}

// True once a navigation has been waiting long enough to be worth mentioning. The
// delay is the point: a page whose chunk is already in hand commits in a frame or
// two, and a bar that appears and vanishes that fast reads as a glitch rather than as
// progress. Only a wait the user would otherwise think was a dropped tap shows it.
export function useNavigationPending(): boolean {
  const pending = useSyncExternalStore(subscribePendingNavigation, getPendingNavigation);
  const location = useLocation();
  const [visible, setVisible] = useState(false);

  // The commit landed — which is exactly what could not be observed while it was
  // pending, since everything on screen was still rendering the previous location.
  useEffect(() => { endNavigation(); }, [location.pathname]);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), NAVIGATION_PENDING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  return visible;
}

const NAVIGATION_PENDING_DELAY_MS = 200;

// How long something has been kept waiting, in the three states the interface has
// to tell apart. Both backend services scale to zero when idle, so the same request
// takes either tens of milliseconds or several seconds depending on nothing the
// user did — and those two want opposite treatment:
//
//   "settling"  Too short to mention. An indicator drawn for a warm answer appears
//               and vanishes within a couple of frames, which reads as a flicker
//               rather than as progress. Same reasoning, and the same delay, as
//               useNavigationPending.
//   "waiting"   Long enough that something on screen has to say so.
//   "cold"      Longer than a service that was already running can explain. Worth
//               saying why rather than only that: one of the services is being
//               started, and no request after this one will be this slow.
export type LoadingPhase = "settling" | "waiting" | "cold";

export function useLoadingPhase(active: boolean): LoadingPhase {
  const [phase, setPhase] = useState<LoadingPhase>("settling");
  // A wait that ends puts the phase back during render rather than from an effect,
  // so the next wait cannot start out at the phase the previous one reached. Same
  // pattern, and the same reason, as the grade override in App.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    setPhase("settling");
  }

  useEffect(() => {
    if (!active) return;
    const waiting = window.setTimeout(() => setPhase("waiting"), LOADING_VISIBLE_DELAY_MS);
    const cold = window.setTimeout(() => setPhase("cold"), LOADING_COLD_DELAY_MS);
    return () => {
      window.clearTimeout(waiting);
      window.clearTimeout(cold);
    };
  }, [active]);

  return phase;
}

const LOADING_VISIBLE_DELAY_MS = 200;
const LOADING_COLD_DELAY_MS = 3000;
