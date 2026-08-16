import type { GradeName } from "../data";
import { load, type Data } from "./data";

export const experimentalEmbuDraftStorageKey = "experimental-embu-draft";

export interface EmbuDraftHokei {
  id: string;
  hokeiName: string;
  grade: GradeName;
  week: number;
  momentIndex: number;
  comment: string;
}

export interface EmbuDraftSequence {
  id: string;
  hokeis: EmbuDraftHokei[];
}

export interface EmbuDraft {
  sequences: EmbuDraftSequence[];
  pendingComment?: string;
}

export function loadExperimentalEmbuDraft(): Data<EmbuDraft> {
  migrateLegacyLocalDraft();
  migrateDraftComments();
  return load(experimentalEmbuDraftStorageKey, { sequences: [] });
}

function migrateLegacyLocalDraft(): void {
  if (localStorage.getItem(experimentalEmbuDraftStorageKey) !== null) return;

  try {
    const oldDocument = JSON.parse(localStorage.getItem("app-data-document") ?? "null") as {
      data?: { embuDraft?: unknown };
    } | null;
    if (!isStoredEmbuDraft(oldDocument?.data?.embuDraft)) return;
    localStorage.setItem(experimentalEmbuDraftStorageKey, JSON.stringify(oldDocument.data.embuDraft));
  } catch {
    // A malformed legacy document must not prevent the experimental builder loading.
  }
}

interface LegacyEmbuDraftHokei extends Omit<EmbuDraftHokei, "comment"> {
  comment?: string;
}

interface FlatEmbuDraftStep extends LegacyEmbuDraftHokei {
  transition: string;
}

interface FlatEmbuDraft {
  notes: string;
  steps: FlatEmbuDraftStep[];
}

interface SequenceEmbuDraft {
  notes: string;
  sequences: Array<{
    id: string;
    hokeis: LegacyEmbuDraftHokei[];
    transition: string;
  }>;
}

function migrateDraftComments(): void {
  const stored = localStorage.getItem(experimentalEmbuDraftStorageKey);
  if (stored === null) return;

  try {
    const parsed = JSON.parse(stored) as unknown;
    if (isEmbuDraft(parsed)) return;

    const legacy = isFlatEmbuDraft(parsed)
      ? {
          notes: parsed.notes,
          sequences: parsed.steps.map(step => ({
            id: `sequence-${step.id}`,
            hokeis: [step],
            transition: step.transition,
          })),
        }
      : isSequenceEmbuDraft(parsed) ? parsed : null;
    if (!legacy) return;

    const sequences: EmbuDraftSequence[] = legacy.sequences.map(sequence => ({
      id: sequence.id,
      hokeis: sequence.hokeis.map((hokei, index) => ({
        id: hokei.id,
        hokeiName: hokei.hokeiName,
        grade: hokei.grade,
        week: hokei.week,
        momentIndex: hokei.momentIndex,
        comment: joinComments(
          hokei.comment ?? "",
          index === sequence.hokeis.length - 1 ? sequence.transition : "",
        ),
      })),
    }));
    const firstHokei = sequences[0]?.hokeis[0];
    if (firstHokei) firstHokei.comment = joinComments(firstHokei.comment, legacy.notes);

    const migrated: EmbuDraft = {
      sequences,
      ...(firstHokei || !legacy.notes ? {} : { pendingComment: legacy.notes }),
    };
    localStorage.setItem(experimentalEmbuDraftStorageKey, JSON.stringify(migrated));
  } catch {
    // A malformed experimental draft is left untouched for possible recovery.
  }
}

function joinComments(first: string, second: string): string {
  if (!first.trim()) return second;
  if (!second.trim()) return first;
  return `${first}\n\n${second}`;
}

function isStoredEmbuDraft(value: unknown): value is EmbuDraft | FlatEmbuDraft | SequenceEmbuDraft {
  return isEmbuDraft(value) || isFlatEmbuDraft(value) || isSequenceEmbuDraft(value);
}

function isEmbuDraft(value: unknown): value is EmbuDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as { notes?: unknown; pendingComment?: unknown; sequences?: unknown; steps?: unknown };
  if (!Array.isArray(candidate.sequences)) return false;
  if (candidate.notes !== undefined || candidate.steps !== undefined) return false;
  if (candidate.pendingComment !== undefined && typeof candidate.pendingComment !== "string") return false;

  return candidate.sequences.every(sequence => {
    if (typeof sequence !== "object" || sequence === null || Array.isArray(sequence)) return false;
    const entry = sequence as Partial<EmbuDraftSequence> & { transition?: unknown };
    return typeof entry.id === "string"
      && entry.transition === undefined
      && Array.isArray(entry.hokeis)
      && entry.hokeis.length > 0
      && entry.hokeis.every(isEmbuDraftHokei);
  });
}

function isSequenceEmbuDraft(value: unknown): value is SequenceEmbuDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as { notes?: unknown; sequences?: unknown };
  if (typeof candidate.notes !== "string" || !Array.isArray(candidate.sequences)) return false;

  return candidate.sequences.every(sequence => {
    if (typeof sequence !== "object" || sequence === null || Array.isArray(sequence)) return false;
    const entry = sequence as SequenceEmbuDraft["sequences"][number];
    return typeof entry.id === "string"
      && typeof entry.transition === "string"
      && Array.isArray(entry.hokeis)
      && entry.hokeis.length > 0
      && entry.hokeis.every(isLegacyEmbuDraftHokei);
  });
}

function isFlatEmbuDraft(value: unknown): value is FlatEmbuDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as { notes?: unknown; steps?: unknown };
  if (typeof candidate.notes !== "string" || !Array.isArray(candidate.steps)) return false;

  return candidate.steps.every(step => {
    if (typeof step !== "object" || step === null || Array.isArray(step)) return false;
    const entry = step as Partial<FlatEmbuDraftStep>;
    return isLegacyEmbuDraftHokei(entry)
      && typeof (entry as Partial<FlatEmbuDraftStep>).transition === "string";
  });
}

function isEmbuDraftHokei(value: unknown): value is EmbuDraftHokei {
  return isLegacyEmbuDraftHokei(value)
    && typeof (value as Partial<EmbuDraftHokei>).comment === "string";
}

function isLegacyEmbuDraftHokei(value: unknown): value is LegacyEmbuDraftHokei {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entry = value as Partial<LegacyEmbuDraftHokei>;
  return typeof entry.id === "string"
    && typeof entry.hokeiName === "string"
    && typeof entry.grade === "string"
    && typeof entry.week === "number"
    && Number.isFinite(entry.week)
    && typeof entry.momentIndex === "number"
    && Number.isFinite(entry.momentIndex)
    && (entry.comment === undefined || typeof entry.comment === "string");
}
