import { createContext } from "react";
import type { GradeName, GradePlan } from "./data";

export interface TrainingViewSettings {
  grade: GradeName;
  gradePlans: GradePlan[];
  onGradeChange: (grade: GradeName) => void;
  dojoMode: boolean;
  onDojoModeChange: (active: boolean) => void;
}

export const TrainingViewSettingsContext = createContext<TrainingViewSettings | null>(null);
