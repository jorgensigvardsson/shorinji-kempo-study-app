import { describe, expect, it } from "vitest";
import { getTrainingControlContext } from "./training-controls-context";

describe("getTrainingControlContext", () => {
  it.each([
    ["/", "", false, false],
    ["/theory", "", false, false],
    ["/theory/grading", "", true, false],
    ["/training/grading", "", true, true],
    ["/kamoku", "", false, false],
    ["/kamoku", "?view=plan", true, true],
    ["/kamoku", "?view=free", false, false],
    ["/kamoku", "?view=free&area=kihon", true, true],
    ["/kamoku", "?view=free&area=hokei", true, true],
    ["/kamoku", "?view=free&area=embu", true, true],
    ["/kamoku", "?view=free&area=randori", false, true],
    ["/kamoku", "?view=free&area=tanen-sotai", false, true],
  ])("maps %s%s to grade=%s and training=%s", (path, search, showGrade, showTrainingMode) => {
    expect(getTrainingControlContext(path, search)).toEqual({ showGrade, showTrainingMode });
  });
});
