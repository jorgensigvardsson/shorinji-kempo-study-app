import type { GradeName } from "../data";
import type { Language } from "../i18n";

// Theme is per-device and no longer part of the document; see persistence/theme.ts.
// Re-exported here because callers have always imported it from the schema.
export type { ThemePreference } from "./theme";
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
  currentWeekAnchor: CurrentWeekAnchor | null;
  kenshiNumber: string | undefined;
  notes: Record<string, string>;
  // When each note was last written, keyed exactly as notes is. A sidecar rather than
  // a richer note value: widening notes to { text, updatedAt } would make a build that
  // predates the change render "[object Object]" in the editor and write it back as
  // the note itself. A field it does not recognise is simply carried through.
  //
  // Sparse by design. Notes written before this existed have no entry, and the merge
  // falls back to asking the reader for those, exactly as it did before.
  notesUpdatedAt: Record<string, string>;
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

// The shape of AppDataState this build writes. Recorded on the stored document, so
// the server knows which shape the data is in.
//
// Bump it when a release starts writing fields an earlier release did not.
//
// 1 — grade, language, currentWeekAnchor, kenshiNumber, notes, notesUpdatedAt,
//     hokeiRanks, hokeiListSelection, quizStreakHighScore, knownFlashCards,
//     showKanjiOnHokeiCards, and the three completion maps.
//
// Deliberately not bumped for notesUpdatedAt. Bumping fires the compat gate, which
// refuses writes from builds predating the compatibility header outright — and what
// they would drop here is merge metadata, not anything anyone wrote. Losing a stamp
// costs a conflict prompt; being locked out of sync costs everything. Whether any
// such build is still syncing is answerable rather than a guess: the server logs
// "outdated client wrote for %s: compat %d" for every one of them.
export const APP_SCHEMA_VERSION = 1;

// The highest schema this build can hold without losing anything — a different
// question from which shape it writes, and the one that decides whether a write is
// safe. This build carries fields it does not recognise through untouched
// (unknownDataFields), so it can round-trip a document written by the next schema as
// well as its own; hence a compatibility version one ahead of what it writes.
//
// The server refuses a write whose compatibility version is below the stored
// document's schema, because such a build would drop the parts it cannot see. Keeping
// the two numbers apart is what lets a build keep syncing through a schema rollout it
// predates, instead of being locked out for not being the newest.
//
// Bump alongside APP_SCHEMA_VERSION, and only after checking the new schema really is
// something older builds round-trip — additive fields are, renamed or restructured
// ones are not.
export const APP_SCHEMA_COMPAT_VERSION = 2;

// What a request carrying neither header is taken to declare: the shape those builds
// write, and the only shape they can hold. Builds before the compatibility header
// existed dropped anything they did not recognise, so they can claim no more than
// their own schema. See the server's putDocument.
export const LEGACY_SCHEMA_VERSION = 1;

// How long one technique's note may be.
//
// The whole document goes to the server as a single body, capped there at 1 MB, and
// notes are the only part of it a reader can grow without limit. There are 288
// techniques a note can be written against, so an unbounded note is the one field
// that can carry the document over on its own — and the failure it causes is a dead
// end: sync stops, and nothing in the app makes the document smaller again.
//
// 2000 characters is far more than anyone writes about a single technique, so it
// reads as a guard rail rather than a restriction. It is counted in characters rather
// than bytes because that is what the reader can see; in the worst case (Japanese, at
// 3 bytes a character) a full note is 6 KB, so it is the count of long notes that
// matters rather than any single one.
export const HOKEI_NOTE_MAX_LENGTH = 2000;

// The fields this build knows the meaning of. Anything else in a stored document was
// written by a newer build and is carried through untouched rather than dropped.
export const KNOWN_DATA_FIELDS: ReadonlySet<string> = new Set(
  Object.keys(createDefaultAppDataDocument().data),
);

// Fields that were once part of the document and have been deliberately retired.
//
// They are unrecognised in the same way a newer build's fields are, but they must be
// treated as the opposite: carrying them through would put them back into the synced
// document they were moved out of. Anything retired from AppDataState belongs here, or
// it comes back the first time an old device syncs.
//
// embuDraft — the experimental Embu builder's draft, moved to its own localStorage key
// so it stays out of the document that syncs to Cosmos. See TODO.md.
// syncProvider — whether this device is signed in. Per-device state, and circular
// where it was: the document only exists on the server once signed in. See
// sync/provider.ts, which also adopts the old value so nobody is signed out by the move.
// theme — which theme this device uses. A theme suits a screen and the light around
// it, not a person, so two devices set differently were never a disagreement — yet as
// a merged scalar it could raise a conflict prompt over a question with no wrong
// answer. See persistence/theme.ts, which adopts the old value so nobody is reset.
export const RETIRED_DATA_FIELDS: ReadonlySet<string> = new Set(["embuDraft", "syncProvider", "theme"]);

// The fields of `data` this build has no schema for. They are never interpreted, only
// preserved, so that a device running an older build cannot erase newer data simply by
// syncing. Fields this build does understand are validated as usual, and retired ones
// are dropped rather than carried.
export function unknownDataFields(data: unknown): Record<string, unknown> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>)
      .filter(([key]) => !KNOWN_DATA_FIELDS.has(key) && !RETIRED_DATA_FIELDS.has(key)),
  );
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
      currentWeekAnchor: null,
      kenshiNumber: undefined,
      notes: {},
      notesUpdatedAt: {},
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
