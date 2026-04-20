import type { GradeName } from "../data";
import type { Language } from "../i18n";
import { DefaultTextSize } from "./text-size";

export type ThemePreference = "light" | "dark" | "system";
export type SyncProvider = "local" | "onedrive" | "google-drive" | "dropbox";

export interface AppDataState {
  grade: GradeName;
  language: Language;
  textSize: number;
  theme: ThemePreference;
  syncProvider: SyncProvider;
  notes: Record<string, string>;
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
      textSize: DefaultTextSize,
      theme: "system",
      syncProvider: "local",
      notes: {},
    },
  };
}
