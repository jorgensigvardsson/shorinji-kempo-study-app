import { createContext } from "react";

export const defaultPins = ["/kamoku/plan", "/kamoku/free/hokei", "/training/grading"];
interface Memory {
    pins: string[];
    togglePin: (path: string) => void;
}
export const NavigationMemory = createContext<Memory>({ pins: defaultPins, togglePin: () => {} });
