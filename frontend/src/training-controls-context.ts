export interface TrainingControlContext {
  showGrade: boolean;
  showTrainingMode: boolean;
}

export function getTrainingControlContext(pathname: string, search: string): TrainingControlContext {
  if (pathname === "/theory/grading") return { showGrade: true, showTrainingMode: false };
  if (pathname === "/training/grading") return { showGrade: true, showTrainingMode: true };
  if (pathname !== "/kamoku") return { showGrade: false, showTrainingMode: false };

  const params = new URLSearchParams(search);
  const view = params.get("view");
  if (view === "plan") return { showGrade: true, showTrainingMode: true };
  if (view !== "free") return { showGrade: false, showTrainingMode: false };

  const area = params.get("area");
  if (!area) return { showGrade: false, showTrainingMode: false };
  return {
    showGrade: area === "kihon" || area === "hokei" || area === "embu",
    showTrainingMode: true,
  };
}
