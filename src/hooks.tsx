import { useState, useEffect } from 'react'
import { getAppDataStore } from './persistence/store';
import type { SyncProvider, ThemePreference } from './persistence/schema';
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
  const [preference, setPreference] = useState<ThemePreference>(() => getAppDataStore().get("theme"));

  useEffect(() => {
    const resolved =
      preference === "system" ? getSystemTheme() : preference;

    applyTheme(resolved);
    getAppDataStore().set("theme", preference);
  }, [preference]);

  useEffect(() => getAppDataStore().subscribe("theme", setPreference), []);

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
    setTheme: setPreference
  };
}

export function useSyncProvider() {
  const [syncProvider, setSyncProvider] = useState<SyncProvider>(() => getAppDataStore().get("syncProvider"));

  useEffect(() => {
    getAppDataStore().set("syncProvider", syncProvider);
  }, [syncProvider]);

  useEffect(() => getAppDataStore().subscribe("syncProvider", setSyncProvider), []);

  return { syncProvider, setSyncProvider };
}

export function useSyncState() {
  const manager = getSyncManager();
  const [state, setState] = useState<SyncState>(() => manager.getState());

  useEffect(() => manager.subscribe(setState), [manager]);

  return state;
}
