import type { GradeName } from "../data";
import type { Language } from "../i18n";

export type ThemePreference = "light" | "dark" | "system";
// "local" means signed out — the document lives only in this browser.
export type SyncProvider = "local" | "backend";
export type HokeiRankValue = 1 | 2 | 3;

export interface HokeiRankEntry {
  value: HokeiRankValue;
  updatedAt: string;
}

export interface FlashCardKnownEntry {
  known: boolean;
  updatedAt: string;
}

export interface WeeklyPlanCompletionEntry {
  completedAt: string;
}

export interface GradingCompletionEntry {
  completedAt: string;
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
  kenshiNumber: string | undefined;
  notes: Record<string, string>;
  hokeiRanks: Record<string, HokeiRankEntry>;
  hokeiListSelection: string;
  quizStreakHighScore: number;
  knownFlashCards: Record<string, FlashCardKnownEntry>;
  showKanjiOnHokeiCards: boolean;
  weeklyPlanCompletions: Record<string, WeeklyPlanCompletionEntry>;
  gradingFundamentalCompletions: Record<string, GradingCompletionEntry>;
  gradingTheoryCompletions: Record<string, GradingCompletionEntry>;
}

export interface AppDataDocument {
  version: number;
  updatedAt: string;
  deviceId: string;
  data: AppDataState;
}

// A kenshi number is stored as a plain run of digits. Written down it is grouped as
// nnn-nnnnnn, so the separators are treated as part of the writing rather than part
// of the number: stripped on the way in, put back for display.
//
// The settings form and the document sanitizer both go through these helpers so the
// two can never disagree: a number the form accepts but the sanitizer rejects looks
// saved until the next load, and then disappears — from this device and, via sync,
// from the server too. For the same reason the stored form stays "any run of digits"
// rather than "exactly nine": tightening it would delete numbers already saved.
export function normalizeKenshiNumber(value: string): string {
  return value.replace(/[\s-]+/g, "");
}

export function isKenshiNumber(value: string): boolean {
  return /^\d+$/.test(value);
}

// Groups a full-length number as nnn-nnnnnn. Anything else is handed back untouched.
export function formatKenshiNumber(value: string): string {
  const groups = /^(\d{3})(\d{6})$/.exec(normalizeKenshiNumber(value));
  return groups ? `${groups[1]}-${groups[2]}` : value;
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
      kenshiNumber: undefined,
      notes: {},
      hokeiRanks: {},
      hokeiListSelection: "own",
      quizStreakHighScore: 0,
      knownFlashCards: {},
      showKanjiOnHokeiCards: true,
      weeklyPlanCompletions: {},
      gradingFundamentalCompletions: {},
      gradingTheoryCompletions: {},
    },
  };
}
