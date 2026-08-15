import { createDefaultAppDataDocument, unknownDataFields, type AppDataDocument, type AppDataState, type FlashCardKnownEntry, type HokeiRankEntry } from "../persistence/schema";

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
    notes: mergeNotes(baseDocument.data.notes ?? {}, local.data.notes ?? {}, remote.data.notes ?? {}, local, remote),
    hokeiRanks: mergeHokeiRanks(baseDocument.data.hokeiRanks ?? {}, local.data.hokeiRanks ?? {}, remote.data.hokeiRanks ?? {}, local, remote),
    hokeiListSelection: mergeScalar("hokeiListSelection"),
    quizStreakHighScore: Math.max(local.data.quizStreakHighScore, remote.data.quizStreakHighScore),
    knownFlashCards: mergeKnownFlashCards(baseDocument.data.knownFlashCards ?? {}, local.data.knownFlashCards ?? {}, remote.data.knownFlashCards ?? {}),
    showKanjiOnHokeiCards: mergeScalar("showKanjiOnHokeiCards"),
    weeklyPlanCompletions: mergeCompletionRecords(
      baseDocument.data.weeklyPlanCompletions ?? {},
      local.data.weeklyPlanCompletions ?? {},
      remote.data.weeklyPlanCompletions ?? {},
      local,
      remote,
    ),
    gradingFundamentalCompletions: mergeCompletionRecords(
      baseDocument.data.gradingFundamentalCompletions ?? {},
      local.data.gradingFundamentalCompletions ?? {},
      remote.data.gradingFundamentalCompletions ?? {},
      local,
      remote,
    ),
    gradingTheoryCompletions: mergeCompletionRecords(
      baseDocument.data.gradingTheoryCompletions ?? {},
      local.data.gradingTheoryCompletions ?? {},
      remote.data.gradingTheoryCompletions ?? {},
      local,
      remote,
    ),
  };

  if (mergedData.notes.__conflictMarker) {
    conflictDetected = true;
    delete mergedData.notes.__conflictMarker;
  }

  if (mergedData.hokeiRanks.__conflictMarker) {
    conflictDetected = true;
    delete mergedData.hokeiRanks.__conflictMarker;
  }

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
    const localChanged = !areEqual(localValue, baseValue);
    const remoteChanged = !areEqual(remoteValue, baseValue);

    if (localChanged && remoteChanged) {
      if (areEqual(localValue, remoteValue)) {
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

type NoteMapWithMarker = Record<string, string> & { __conflictMarker?: string };
type HokeiRankMapWithMarker = Record<string, HokeiRankEntry> & { __conflictMarker?: string };

function mergeNotes(
  base: Record<string, string>,
  local: Record<string, string>,
  remote: Record<string, string>,
  localDocument: AppDataDocument,
  remoteDocument: AppDataDocument
): NoteMapWithMarker {
  const result: NoteMapWithMarker = {};
  const allKeys = new Set<string>([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ]);

  for (const key of allKeys) {
    const baseValue = readOptional(base, key);
    const localValue = readOptional(local, key);
    const remoteValue = readOptional(remote, key);
    const localChanged = localValue !== baseValue;
    const remoteChanged = remoteValue !== baseValue;

    if (localChanged && remoteChanged && localValue !== remoteValue) {
      result.__conflictMarker = "true";
      const winner = newerByTimestamp(localValue, remoteValue, localDocument, remoteDocument);
      if (winner !== undefined) {
        result[key] = winner;
      }
      continue;
    }

    const chosen = localChanged ? localValue : (remoteChanged ? remoteValue : baseValue);
    if (chosen !== undefined) {
      result[key] = chosen;
    }
  }

  return result;
}

function mergeHokeiRanks(
  base: Record<string, HokeiRankEntry>,
  local: Record<string, HokeiRankEntry>,
  remote: Record<string, HokeiRankEntry>,
  localDocument: AppDataDocument,
  remoteDocument: AppDataDocument
): HokeiRankMapWithMarker {
  const result: HokeiRankMapWithMarker = {};
  const allKeys = new Set<string>([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ]);

  for (const key of allKeys) {
    const baseValue = readOptional(base, key);
    const localValue = readOptional(local, key);
    const remoteValue = readOptional(remote, key);
    const localChanged = !areEqual(localValue, baseValue);
    const remoteChanged = !areEqual(remoteValue, baseValue);

    if (localChanged && remoteChanged && !areEqual(localValue, remoteValue)) {
      result.__conflictMarker = "true";
      const winner = newerRank(localValue, remoteValue, localDocument, remoteDocument);
      if (winner) {
        result[key] = winner;
      }
      continue;
    }

    const chosen = localChanged ? localValue : (remoteChanged ? remoteValue : baseValue);
    if (chosen) {
      result[key] = chosen;
    }
  }

  return result;
}

function mergeKnownFlashCards(
  base: Record<string, FlashCardKnownEntry>,
  local: Record<string, FlashCardKnownEntry>,
  remote: Record<string, FlashCardKnownEntry>,
): Record<string, FlashCardKnownEntry> {
  const result: Record<string, FlashCardKnownEntry> = {};
  const allKeys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const key of allKeys) {
    const baseEntry = validFlashCardEntry(readOptional(base as Record<string, unknown>, key));
    const localEntry = validFlashCardEntry(readOptional(local as Record<string, unknown>, key));
    const remoteEntry = validFlashCardEntry(readOptional(remote as Record<string, unknown>, key));

    const localChanged = !flashCardEntriesEqual(localEntry, baseEntry);
    const remoteChanged = !flashCardEntriesEqual(remoteEntry, baseEntry);

    if (localChanged && remoteChanged) {
      if (!localEntry && remoteEntry) { result[key] = remoteEntry; continue; }
      if (localEntry && !remoteEntry) { result[key] = localEntry; continue; }
      if (localEntry && remoteEntry) {
        result[key] = parseTimestamp(localEntry.updatedAt) >= parseTimestamp(remoteEntry.updatedAt)
          ? localEntry
          : remoteEntry;
      }
      continue;
    }

    if (localChanged) {
      if (localEntry) result[key] = localEntry;
      continue;
    }

    if (remoteChanged) {
      if (remoteEntry) result[key] = remoteEntry;
      continue;
    }

    if (baseEntry) result[key] = baseEntry;
  }
  return result;
}

function mergeCompletionRecords<TEntry extends { completedAt: string }>(
  base: Record<string, TEntry>,
  local: Record<string, TEntry>,
  remote: Record<string, TEntry>,
  localDocument: AppDataDocument,
  remoteDocument: AppDataDocument,
): Record<string, TEntry> {
  const result: Record<string, TEntry> = {};
  const allKeys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);

  for (const key of allKeys) {
    const baseEntry = readOptional(base, key);
    const localEntry = readOptional(local, key);
    const remoteEntry = readOptional(remote, key);
    const localChanged = !areEqual(localEntry, baseEntry);
    const remoteChanged = !areEqual(remoteEntry, baseEntry);
    let chosen: TEntry | undefined;

    if (localChanged && remoteChanged) {
      if (areEqual(localEntry, remoteEntry)) chosen = localEntry;
      else if (localEntry && remoteEntry) {
        chosen = parseTimestamp(localEntry.completedAt) >= parseTimestamp(remoteEntry.completedAt)
          ? localEntry
          : remoteEntry;
      } else {
        chosen = newerOf(localDocument, remoteDocument) === localDocument ? localEntry : remoteEntry;
      }
    } else if (localChanged) chosen = localEntry;
    else if (remoteChanged) chosen = remoteEntry;
    else chosen = baseEntry;

    if (chosen) result[key] = chosen;
  }

  return result;
}

function flashCardEntriesEqual(a: FlashCardKnownEntry | undefined, b: FlashCardKnownEntry | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.known === b.known && a.updatedAt === b.updatedAt;
}

function validFlashCardEntry(e: unknown): FlashCardKnownEntry | undefined {
  if (typeof e !== "object" || e === null || Array.isArray(e)) return undefined;
  const c = e as Record<string, unknown>;
  if (typeof c.known !== "boolean" || typeof c.updatedAt !== "string") return undefined;
  return e as FlashCardKnownEntry;
}

function newerByTimestamp(
  localValue: string | undefined,
  remoteValue: string | undefined,
  localDocument: AppDataDocument,
  remoteDocument: AppDataDocument
): string | undefined {
  return parseTimestamp(localDocument.updatedAt) >= parseTimestamp(remoteDocument.updatedAt)
    ? localValue
    : remoteValue;
}

function readOptional<T>(map: Record<string, T>, key: string): T | undefined {
  return key in map ? map[key] : undefined;
}

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

  return parseTimestamp(localDocument.updatedAt) >= parseTimestamp(remoteDocument.updatedAt)
    ? localValue
    : remoteValue;
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

function areEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
