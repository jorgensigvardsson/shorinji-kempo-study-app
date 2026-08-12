import type { GradeName } from "../data";
import { load, type Data } from "./data";

export const experimentalEmbuDraftStorageKey = "experimental-embu-draft";

export interface EmbuDraftStep {
  id: string;
  hokeiName: string;
  grade: GradeName;
  week: number;
  momentIndex: number;
  transition: string;
}

export interface EmbuDraft {
  notes: string;
  steps: EmbuDraftStep[];
}

export function loadExperimentalEmbuDraft(): Data<EmbuDraft> {
  migrateLegacyLocalDraft();
  return load(experimentalEmbuDraftStorageKey, { notes: "", steps: [] });
}

function migrateLegacyLocalDraft(): void {
  if (localStorage.getItem(experimentalEmbuDraftStorageKey) !== null) return;

  try {
    const oldDocument = JSON.parse(localStorage.getItem("app-data-document") ?? "null") as {
      data?: { embuDraft?: unknown };
    } | null;
    if (!isEmbuDraft(oldDocument?.data?.embuDraft)) return;
    localStorage.setItem(experimentalEmbuDraftStorageKey, JSON.stringify(oldDocument.data.embuDraft));
  } catch {
    // A malformed legacy document must not prevent the experimental builder loading.
  }
}

function isEmbuDraft(value: unknown): value is EmbuDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as { notes?: unknown; steps?: unknown };
  if (typeof candidate.notes !== "string" || !Array.isArray(candidate.steps)) return false;

  return candidate.steps.every(step => {
    if (typeof step !== "object" || step === null || Array.isArray(step)) return false;
    const entry = step as Partial<EmbuDraftStep>;
    return typeof entry.id === "string"
      && typeof entry.hokeiName === "string"
      && typeof entry.grade === "string"
      && typeof entry.week === "number"
      && Number.isFinite(entry.week)
      && typeof entry.momentIndex === "number"
      && Number.isFinite(entry.momentIndex)
      && typeof entry.transition === "string";
  });
}
