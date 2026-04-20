import type { GradeName } from "../data";
import type { Language } from "../i18n";

export type ThemePreference = "light" | "dark" | "system";
export type SyncProvider = "local" | "onedrive" | "google-drive" | "dropbox";
export type HokeiRankValue = 1 | 2 | 3;

export interface HokeiRankEntry {
  value: HokeiRankValue;
  updatedAt: string;
}

export interface CurrentWeekAnchor {
  week: number;
  anchorDate: string; // YYYY-MM-DD in local time
}

export interface AppDataState {
  grade: GradeName;
  language: Language;
  theme: ThemePreference;
  currentWeekAnchor: CurrentWeekAnchor | null;
  syncProvider: SyncProvider;
  notes: Record<string, string>;
  hokeiRanks: Record<string, HokeiRankEntry>;
}

export interface AppDataDocument {
  version: number;
  updatedAt: string;
  deviceId: string;
  data: AppDataState;
}

function newDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultAppDataDocument(): AppDataDocument {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    deviceId: newDeviceId(),
    data: {
      grade: "shodan",
      language: "sv",
      theme: "system",
      currentWeekAnchor: null,
      syncProvider: "local",
      notes: {},
      hokeiRanks: {},
    },
  };
}
