import { createDefaultAppDataDocument, unknownDataFields, type AppDataDocument, type AppDataState, type FlashCardKnownEntry, type HokeiRankEntry } from "../persistence/schema";
import { deepEqual } from "../utilities/deep-equal";

export interface MergeResult {
  document: AppDataDocument;
  conflictDetected: boolean;
}

function withDefaultData(doc: AppDataDocument): AppDataDocument {
  const { data: defaults } = createDefaultAppDataDocument();
  return { ...doc, data: { ...defaults, ...doc.data } };
}

export function mergeDocuments(
  base: AppDataDocument | null,
  local: AppDataDocument,
  remote: AppDataDocument
): MergeResult {
  if (!base) {
    // No sync history on this device. Use schema defaults as the implicit common
    // ancestor so the field-by-field merge runs normally. Without this, newerOf()
    // would pick the fresh device's document (updatedAt=now) over older cloud data,
    // silently deleting whatever the cloud had.
    base = createDefaultAppDataDocument();
  }

  // Fill in defaults for any fields missing from older-version documents so that
  // absent fields are not mistaken for an explicit change to undefined.
  local = withDefaultData(local);
  remote = withDefaultData(remote);
  base = withDefaultData(base);

  const baseDocument = base;
  let conflictDetected = false;

  // Every map field is the same three-way walk over the union of keys, differing only
  // in how entries are compared, who wins a genuine disagreement, and whether that
  // disagreement is something to ask the user about. Those differences are the rules
  // below; the walk itself is mergeMap.
  const notes = mergeMap<string>(baseDocument.data.notes, local.data.notes, remote.data.notes, {
    // A note is text the user wrote. Picking a winner by timestamp would silently
    // discard someone's writing, so a real disagreement goes to them.
    escalates: true,
    pickWinner: (localValue, remoteValue) => newerOf(local, remote) === local ? localValue : remoteValue,
  });

  const hokeiRanks = mergeMap<HokeiRankEntry>(baseDocument.data.hokeiRanks, local.data.hokeiRanks, remote.data.hokeiRanks, {
    escalates: true,
    pickWinner: (localValue, remoteValue) => newerRank(localValue, remoteValue, local, remote),
  });

  // The entry-timestamped maps below settle themselves: each entry records when it was
  // set, so there is a principled winner without troubling anyone. Two devices ticking
  // different keys is not a disagreement at all — different keys, both kept.
  const knownFlashCards = mergeMap<FlashCardKnownEntry>(
    baseDocument.data.knownFlashCards, local.data.knownFlashCards, remote.data.knownFlashCards, {
      escalates: false,
      accept: validFlashCardEntry,
      pickWinner: (localValue, remoteValue) => newerByEntryTime(localValue, remoteValue, entry => entry.updatedAt),
    });

  const completionRules = {
    escalates: false,
    pickWinner: (localValue?: { completedAt: string }, remoteValue?: { completedAt: string }) =>
      newerByEntryTime(localValue, remoteValue, entry => entry.completedAt)
        ?? (newerOf(local, remote) === local ? localValue : remoteValue),
  };
  const weeklyPlanCompletions = mergeMap(
    baseDocument.data.weeklyPlanCompletions, local.data.weeklyPlanCompletions, remote.data.weeklyPlanCompletions, completionRules);
  const gradingFundamentalCompletions = mergeMap(
    baseDocument.data.gradingFundamentalCompletions, local.data.gradingFundamentalCompletions, remote.data.gradingFundamentalCompletions, completionRules);
  const gradingTheoryCompletions = mergeMap(
    baseDocument.data.gradingTheoryCompletions, local.data.gradingTheoryCompletions, remote.data.gradingTheoryCompletions, completionRules);

  conflictDetected = notes.conflicted || hokeiRanks.conflicted;

  const mergedData: AppDataState = {
    // Fields written by a newer build, carried through so that merging on an older
    // device does not delete them. There is no schema here to merge them by, so the
    // newer document's copy wins wholesale — the honest option when the alternative
    // is dropping them. Known fields below override anything of the same name.
    ...mergeUnknownFields(local, remote),
    grade: mergeScalar("grade"),
    language: mergeScalar("language"),
    theme: mergeScalar("theme"),
    currentWeekAnchor: mergeScalar("currentWeekAnchor"),
    syncProvider: mergeScalar("syncProvider"),
    kenshiNumber: mergeScalar("kenshiNumber"),
    notes: notes.merged,
    hokeiRanks: hokeiRanks.merged,
    hokeiListSelection: mergeScalar("hokeiListSelection"),
    // A high score has an obvious winner, so it never disagrees.
    quizStreakHighScore: Math.max(local.data.quizStreakHighScore, remote.data.quizStreakHighScore),
    knownFlashCards: knownFlashCards.merged,
    showKanjiOnHokeiCards: mergeScalar("showKanjiOnHokeiCards"),
    weeklyPlanCompletions: weeklyPlanCompletions.merged,
    gradingFundamentalCompletions: gradingFundamentalCompletions.merged,
    gradingTheoryCompletions: gradingTheoryCompletions.merged,
  };

  return {
    document: {
      ...local,
      version: Math.max(local.version, remote.version),
      updatedAt: latestTimestamp(local.updatedAt, remote.updatedAt),
      data: mergedData,
    },
    conflictDetected,
  };

  function mergeScalar<TKey extends Exclude<keyof AppDataState, "notes" | "knownFlashCards">>(key: TKey): AppDataState[TKey] {
    const baseValue = baseDocument.data[key];
    const localValue = local.data[key];
    const remoteValue = remote.data[key];
    const localChanged = !deepEqual(localValue, baseValue);
    const remoteChanged = !deepEqual(remoteValue, baseValue);

    if (localChanged && remoteChanged) {
      if (deepEqual(localValue, remoteValue)) {
        return localValue;
      }

      conflictDetected = true;
      return newerOf(local, remote).data[key];
    }

    if (localChanged) {
      return localValue;
    }

    if (remoteChanged) {
      return remoteValue;
    }

    return baseValue;
  }
}

interface MapMergeRules<TEntry> {
  // Whether a genuine disagreement is something to put to the user, or something this
  // code is entitled to settle on its own.
  escalates: boolean;
  // Which side wins when both changed a key to different values.
  pickWinner: (local: TEntry | undefined, remote: TEntry | undefined) => TEntry | undefined;
  // Optional per-entry validation. An entry that fails is treated as absent, so a
  // malformed one is dropped rather than merged into a document as if it were real.
  accept?: (value: unknown) => TEntry | undefined;
}

interface MapMergeResult<TEntry> {
  merged: Record<string, TEntry>;
  // Whether a disagreement arose that the rules said to escalate.
  conflicted: boolean;
}

// The three-way merge, per key, over the union of the keys all three sides hold.
// Comparing each side against the base is what makes "changed" mean anything: without
// it there is no telling "I added this" from "they deleted it".
function mergeMap<TEntry>(
  base: Record<string, TEntry> | undefined,
  local: Record<string, TEntry> | undefined,
  remote: Record<string, TEntry> | undefined,
  rules: MapMergeRules<TEntry>,
): MapMergeResult<TEntry> {
  const baseMap = base ?? {};
  const localMap = local ?? {};
  const remoteMap = remote ?? {};
  const accept = rules.accept ?? (value => value as TEntry | undefined);

  const merged: Record<string, TEntry> = {};
  let conflicted = false;

  for (const key of new Set([...Object.keys(baseMap), ...Object.keys(localMap), ...Object.keys(remoteMap)])) {
    const baseEntry = accept(readOptional(baseMap, key));
    const localEntry = accept(readOptional(localMap, key));
    const remoteEntry = accept(readOptional(remoteMap, key));
    const localChanged = !deepEqual(localEntry, baseEntry);
    const remoteChanged = !deepEqual(remoteEntry, baseEntry);

    let chosen: TEntry | undefined;
    if (localChanged && remoteChanged) {
      if (deepEqual(localEntry, remoteEntry)) {
        chosen = localEntry; // both moved the same way, which is agreement
      } else {
        if (rules.escalates) conflicted = true;
        chosen = rules.pickWinner(localEntry, remoteEntry);
      }
    } else if (localChanged) {
      chosen = localEntry;
    } else if (remoteChanged) {
      chosen = remoteEntry;
    } else {
      chosen = baseEntry;
    }

    // Absent means deleted on both sides, or never present. Either way it stays out.
    if (chosen !== undefined) merged[key] = chosen;
  }

  return { merged, conflicted };
}

// Whichever entry was set later. Returns undefined when neither side has one, so a
// caller can fall back to something else.
function newerByEntryTime<TEntry>(
  local: TEntry | undefined,
  remote: TEntry | undefined,
  timeOf: (entry: TEntry) => string,
): TEntry | undefined {
  if (!local) return remote;
  if (!remote) return local;
  return parseTimestamp(timeOf(local)) >= parseTimestamp(timeOf(remote)) ? local : remote;
}

function validFlashCardEntry(e: unknown): FlashCardKnownEntry | undefined {
  if (typeof e !== "object" || e === null || Array.isArray(e)) return undefined;
  const c = e as Record<string, unknown>;
  if (typeof c.known !== "boolean" || typeof c.updatedAt !== "string") return undefined;
  return e as FlashCardKnownEntry;
}

function readOptional<T>(map: Record<string, T>, key: string): T | undefined {
  return key in map ? map[key] : undefined;
}

// A rank carries its own timestamp, so that decides. Two ranks set at the same instant
// on different devices is the one case left, and the newer document breaks the tie.
function newerRank(
  localValue: HokeiRankEntry | undefined,
  remoteValue: HokeiRankEntry | undefined,
  localDocument: AppDataDocument,
  remoteDocument: AppDataDocument
): HokeiRankEntry | undefined {
  if (!localValue) return remoteValue;
  if (!remoteValue) return localValue;

  const localUpdated = parseTimestamp(localValue.updatedAt);
  const remoteUpdated = parseTimestamp(remoteValue.updatedAt);
  if (localUpdated !== remoteUpdated) {
    return localUpdated >= remoteUpdated ? localValue : remoteValue;
  }

  return newerOf(localDocument, remoteDocument) === localDocument ? localValue : remoteValue;
}

// Unions the fields neither side has a schema for, letting the newer document win
// where both carry the same one. A field present on only one side is kept either way:
// it is more likely a field the other device has not learned about yet than one that
// was deliberately removed.
function mergeUnknownFields(local: AppDataDocument, remote: AppDataDocument): Record<string, unknown> {
  const newer = newerOf(local, remote);
  const older = newer === local ? remote : local;
  return { ...unknownDataFields(older.data), ...unknownDataFields(newer.data) };
}

function newerOf(local: AppDataDocument, remote: AppDataDocument): AppDataDocument {
  return parseTimestamp(local.updatedAt) >= parseTimestamp(remote.updatedAt) ? local : remote;
}

function latestTimestamp(a: string, b: string): string {
  return parseTimestamp(a) >= parseTimestamp(b) ? a : b;
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
