export interface ChangelogChange {
  emoji: string;
  sv: string;
  en: string;
  tr: string;
  ja: string;
}

export interface ChangelogEntry {
  timestamp: string;
  changes: ChangelogChange[];
}

// The entries live in changelog-entries.ts and are fetched on demand: they are the
// full release history in four languages, and nothing about the first paint depends
// on them. What the app needs at startup is only whether there is something unseen,
// and that answer arrives a moment later without holding anything up.
const LAST_SEEN_KEY = "lastSeenVersion";

export interface ChangelogUpdate {
  version: string;
  changes: ChangelogChange[];
}

export const loadChangelog = () => import("./changelog-entries");

// Null when the newest entry has already been seen on this device.
export async function unseenChangelog(): Promise<ChangelogUpdate | null> {
  const { CHANGELOG, CURRENT_VERSION } = await loadChangelog();
  if (localStorage.getItem(LAST_SEEN_KEY) === CURRENT_VERSION) return null;
  return { version: CURRENT_VERSION, changes: CHANGELOG[0].changes };
}

export function markChangelogSeen(version: string): void {
  localStorage.setItem(LAST_SEEN_KEY, version);
}
