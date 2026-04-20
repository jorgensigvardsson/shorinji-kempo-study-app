import type { AppDataDocument, AppDataState, HokeiRankEntry } from "../persistence/schema";

export interface MergeResult {
  document: AppDataDocument;
  conflictDetected: boolean;
}

export function mergeDocuments(
  base: AppDataDocument | null,
  local: AppDataDocument,
  remote: AppDataDocument
): MergeResult {
  if (!base) {
    return {
      document: newerOf(local, remote),
      conflictDetected: false,
    };
  }

  const baseDocument = base;
  let conflictDetected = false;
  const mergedData: AppDataState = {
    grade: mergeScalar("grade"),
    language: mergeScalar("language"),
    theme: mergeScalar("theme"),
    currentWeekAnchor: mergeScalar("currentWeekAnchor"),
    syncProvider: mergeScalar("syncProvider"),
    notes: mergeNotes(baseDocument.data.notes, local.data.notes, remote.data.notes, local, remote),
    hokeiRanks: mergeHokeiRanks(baseDocument.data.hokeiRanks, local.data.hokeiRanks, remote.data.hokeiRanks, local, remote),
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

  function mergeScalar<TKey extends Exclude<keyof AppDataState, "notes">>(key: TKey): AppDataState[TKey] {
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
