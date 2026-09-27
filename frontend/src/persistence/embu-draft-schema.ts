import type { GradeName } from "../data";

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

const isDraftHokei = (value: unknown): value is EmbuDraftHokei => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const hokei = value as Record<string, unknown>;
  return (
    typeof hokei.id === "string" &&
    typeof hokei.hokeiName === "string" &&
    typeof hokei.grade === "string" &&
    typeof hokei.week === "number" &&
    Number.isFinite(hokei.week) &&
    typeof hokei.momentIndex === "number" &&
    Number.isFinite(hokei.momentIndex) &&
    typeof hokei.comment === "string"
  );
};

const isDraftSequence = (value: unknown): value is EmbuDraftSequence => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const sequence = value as Record<string, unknown>;
  return (
    typeof sequence.id === "string" &&
    Array.isArray(sequence.hokeis) &&
    sequence.hokeis.every(isDraftHokei)
  );
};

export const isEmbuDraft = (value: unknown): value is EmbuDraft => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  return (
    draft.notes === undefined &&
    draft.steps === undefined &&
    Array.isArray(draft.sequences) &&
    draft.sequences.every(isDraftSequence) &&
    (draft.pendingComment === undefined ||
      typeof draft.pendingComment === "string")
  );
};
