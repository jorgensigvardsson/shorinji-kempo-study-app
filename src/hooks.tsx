import { useState, useEffect } from 'react'

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

const STORAGE_KEY = "theme-preference";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: "light" | "dark") {
  document.documentElement.setAttribute("data-bs-theme", theme);
}

export function useTheme() {
  const [preference, setPreference] = useState<"light" | "dark" | "system">(
    () => (localStorage.getItem(STORAGE_KEY) as any) ?? "system"
  );

  useEffect(() => {
    const resolved =
      preference === "system" ? getSystemTheme() : preference;

    applyTheme(resolved);
    localStorage.setItem(STORAGE_KEY, preference);
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
    setTheme: setPreference
  };
}
