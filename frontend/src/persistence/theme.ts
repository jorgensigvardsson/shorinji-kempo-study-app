// Which theme this device uses.
//
// This used to live in the synced app-data document, where it did not belong. A theme
// suits a screen and the light around it, not a person: a phone read in a dark dojo and
// a laptop in a bright room are two different answers, and there is no reason for one
// to overwrite the other. Worse, it was a merged scalar, so two devices set differently
// were a disagreement — and `mergeScalar` escalates one, meaning the app could put a
// conflict prompt in front of someone over which theme they preferred, a question with
// no wrong answer and nothing for them to resolve.
//
// It is per-device state, so it lives per device — the same move `syncProvider` made,
// for the same reason. See RETIRED_DATA_FIELDS, which stops it coming back the first
// time an older device syncs.
export type ThemePreference = "light" | "dark" | "system";

const storageKey = "theme-preference";
// Where it used to live. Read once, so a device that has chosen a theme keeps it
// across the upgrade rather than being reset to "system".
const legacyDocumentKey = "app-data-document";

type Listener = (theme: ThemePreference) => void;

let current: ThemePreference | null = null;
let nextListenerId = 0;
const listeners = new Map<number, Listener>();

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function readLegacyDocumentTheme(): ThemePreference | null {
  try {
    const raw = localStorage.getItem(legacyDocumentKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: { theme?: unknown } };
    return isThemePreference(parsed.data?.theme) ? parsed.data.theme : null;
  } catch {
    // A document we cannot read is not worth failing a first paint over.
    return null;
  }
}

function read(): ThemePreference {
  try {
    const stored = localStorage.getItem(storageKey);
    if (isThemePreference(stored)) return stored;
  } catch {
    return "system";
  }

  // Nothing of its own yet: adopt whatever the document said, once, and write it
  // where it now belongs so the next read needs no fallback.
  const adopted = readLegacyDocumentTheme() ?? "system";
  try {
    localStorage.setItem(storageKey, adopted);
  } catch {
    // Storage full or blocked. The preference is still correct for this session.
  }
  return adopted;
}

export function getThemePreference(): ThemePreference {
  current ??= read();
  return current;
}

export function setThemePreference(theme: ThemePreference): void {
  if (getThemePreference() === theme) return;
  current = theme;
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    // As above: remembered for this session even when it cannot be written down.
  }
  for (const listener of listeners.values()) listener(theme);
}

export function subscribeThemePreference(listener: Listener): () => void {
  const id = nextListenerId++;
  listeners.set(id, listener);
  return () => { listeners.delete(id); };
}

// Test seam: the module holds its value in a closure, which would otherwise persist
// between tests in the same file.
export function resetThemePreferenceCache(): void {
  current = null;
  listeners.clear();
}
