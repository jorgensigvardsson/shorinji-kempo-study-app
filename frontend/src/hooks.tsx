import { useState, useEffect, useSyncExternalStore } from 'react'
import { setAppData, useAppData } from './persistence/use-app-data';
import type { ThemePreference } from './persistence/schema';
import { getSyncProvider, setSyncProvider, subscribeSyncProvider, type SyncProvider } from './sync/provider';
import { getSyncManager } from './sync/manager';
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
  const preference = useAppData("theme");

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
    setTheme: (theme: ThemePreference) => setAppData("theme", theme)
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
