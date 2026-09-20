import { createContext } from "react";
import type { GradeName } from "./data";
import { activityForUrl, type Activity } from "./navigation";

export interface Visit { url: string; grade: GradeName }
export const defaultPins = ["/kamoku/plan", "/kamoku/free/hokei", "/training/grading"];
interface Memory {
    pins: string[];
    recent: Visit[];
    togglePin: (path: string) => void;
    resume: (visit: Visit) => void;
    describe: (url: string) => Activity | undefined;
}
export const NavigationMemory = createContext<Memory>({ pins: defaultPins, recent: [], togglePin: () => {}, resume: () => {}, describe: activityForUrl });
