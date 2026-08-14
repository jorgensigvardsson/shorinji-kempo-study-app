import { parseTrainingPath, TRAINING_ROOT } from "./training-routes";

export interface TrainingControlContext {
  showGrade: boolean;
  showTrainingMode: boolean;
}

export function getTrainingControlContext(pathname: string): TrainingControlContext {
  if (pathname === "/theory/grading") return { showGrade: true, showTrainingMode: false };
  if (pathname === "/training/grading") return { showGrade: true, showTrainingMode: true };
  if (pathname !== TRAINING_ROOT && !pathname.startsWith(`${TRAINING_ROOT}/`)) {
    return { showGrade: false, showTrainingMode: false };
  }

  const { view, area } = parseTrainingPath(pathname);
  if (view === "plan") return { showGrade: true, showTrainingMode: true };
  if (view !== "free" || !area) return { showGrade: false, showTrainingMode: false };

  return {
    showGrade: area === "kihon" || area === "hokei" || area === "embu",
    showTrainingMode: true,
  };
}
