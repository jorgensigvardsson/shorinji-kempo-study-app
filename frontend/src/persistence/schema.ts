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

// A kenshi number is written down grouped as [n]nnn-nnnnnn: a leading group of three
// or four digits, then six. Hombu issued three-digit leading groups until it ran out
// of them, so both are in circulation. The separators belong to the writing rather
// than to the number — stripped on the way in, put back for display — and the stored
// form is the ten digits, with a nine-digit number carrying the leading zero it is
// written without. That way one canonical value covers both lengths, and the numbers
// already saved at nine digits are read as the same number rather than as a different
// one.
//
// The settings form and the document sanitizer both go through these helpers so the
// two can never disagree: a number the form accepts but the sanitizer rejects looks
// saved until the next load, and then disappears — from this device and, via sync,
// from the server too. That is also why the sanitizer keeps accepting any run of
// digits: narrowing what it stores would delete numbers already saved.
export function normalizeKenshiNumber(value: string): string {
  return value.replace(/[\s-]+/g, "");
}

export function isKenshiNumber(value: string): boolean {
  return /^\d+$/.test(value);
}

// Whether a number is one a kenshi could actually have been issued.
export function isCompleteKenshiNumber(value: string): boolean {
  return /^\d{9,10}$/.test(normalizeKenshiNumber(value));
}

// The stored form: ten digits, padding a nine-digit number with its leading zero.
// Anything else is handed back stripped of separators but otherwise untouched.
export function canonicalKenshiNumber(value: string): string {
  const digits = normalizeKenshiNumber(value);
  return /^\d{9}$/.test(digits) ? `0${digits}` : digits;
}

// Groups a number as [n]nnn-nnnnnn, leaving off the leading zero that a nine-digit
// number is padded with. Anything that is not a whole number is handed back untouched.
export function formatKenshiNumber(value: string): string {
  const groups = /^(\d{4})(\d{6})$/.exec(canonicalKenshiNumber(value));
  return groups ? `${groups[1].replace(/^0/, "")}-${groups[2]}` : value;
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
