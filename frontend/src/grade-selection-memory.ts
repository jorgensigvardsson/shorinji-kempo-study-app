import { useBrowserState } from "./browser-state";
import type { GradeName } from "./data";

// What a grade picker remembers: the choice, and the training grade it was made
// under. A choice made for another training grade is not carried over: once the
// reader has moved on, the picker starts from their new grade, as it would on
// their first visit.
interface RememberedGradeSelection {
    trainingGrade: string;
    value: string;
}

const isRemembered = (value: unknown): value is RememberedGradeSelection | null =>
    value === null || (typeof value === "object"
        && typeof (value as RememberedGradeSelection).trainingGrade === "string"
        && typeof (value as RememberedGradeSelection).value === "string");

// A grade picker's selection, remembered on this device for this account and
// never synced. `choices` are the values the picker currently offers; anything
// remembered outside them falls back to the training grade rather than leaving
// the picker showing nothing.
export function useRememberedGradeSelection<T extends string>(
    name: string,
    trainingGrade: GradeName,
    choices: readonly string[],
): [T, (value: T) => void] {
    const [remembered, setRemembered] = useBrowserState<RememberedGradeSelection | null>(
        `grade-selection:${name}`, null, isRemembered, true);
    const value = remembered !== null
        && remembered.trainingGrade === trainingGrade
        && choices.includes(remembered.value)
        ? remembered.value as T
        : trainingGrade as T;
    return [value, next => setRemembered({ trainingGrade, value: next })];
}
