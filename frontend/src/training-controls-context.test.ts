import { describe, expect, it } from "vitest";
import { getTrainingControlContext } from "./training-controls-context";

describe("getTrainingControlContext", () => {
  it.each([
    ["/", false, false],
    ["/theory", false, false],
    ["/theory/grading", true, false],
    ["/training/grading", true, true],
    ["/kamoku", false, false],
    ["/kamoku/plan", true, true],
    ["/kamoku/free", false, false],
    ["/kamoku/free/kihon", true, true],
    ["/kamoku/free/hokei", true, true],
    ["/kamoku/free/embu", true, true],
    ["/kamoku/free/randori", false, true],
    ["/kamoku/free/tanen-sotai", false, true],
    // A path that merely starts with the same characters is not the training
    // section, and an unknown area falls back to the bare free-practice view.
    ["/kamokuhyo", false, false],
    ["/kamoku/free/nonsense", false, false],
  ])("maps %s to grade=%s and training=%s", (path, showGrade, showTrainingMode) => {
    expect(getTrainingControlContext(path)).toEqual({ showGrade, showTrainingMode });
  });
});
