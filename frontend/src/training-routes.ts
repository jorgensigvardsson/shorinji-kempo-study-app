import { isPracticeArea, type PracticeArea } from "./practice-area";

export type TrainingView = "landing" | "plan" | "free";

/** The training section's root path. Everything below is derived from it. */
export const TRAINING_ROOT = "/kamoku";

export interface TrainingLocation {
    view: TrainingView;
    area: PracticeArea | null;
}

/**
 * Reads a training URL: /kamoku, /kamoku/plan, /kamoku/free, /kamoku/free/<area>.
 *
 * Anything unrecognized below /kamoku falls back to the landing view rather than
 * 404-ing, so a mistyped or truncated path still lands somewhere useful.
 */
export function parseTrainingPath(pathname: string): TrainingLocation {
    const [root, view, area] = pathname.split("/").filter(Boolean);

    if (root !== TRAINING_ROOT.slice(1)) return { view: "landing", area: null };
    if (view === "plan") return { view: "plan", area: null };
    if (view === "free") return { view: "free", area: area && isPracticeArea(area) ? area : null };

    return { view: "landing", area: null };
}

/** Builds the URL for a training view, the inverse of parseTrainingPath. */
export function trainingPath(view: TrainingView, area?: PracticeArea | null): string {
    if (view === "plan") return `${TRAINING_ROOT}/plan`;
    if (view === "free") return area ? `${TRAINING_ROOT}/free/${area}` : `${TRAINING_ROOT}/free`;

    return TRAINING_ROOT;
}
