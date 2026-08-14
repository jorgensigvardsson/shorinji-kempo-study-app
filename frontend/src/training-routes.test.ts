import { describe, expect, it } from "vitest";
import { parseTrainingPath, trainingPath } from "./training-routes";

describe("parseTrainingPath", () => {
  it.each([
    ["/kamoku", "landing", null],
    ["/kamoku/", "landing", null],
    ["/kamoku/plan", "plan", null],
    ["/kamoku/free", "free", null],
    ["/kamoku/free/kihon", "free", "kihon"],
    ["/kamoku/free/tanen-sotai", "free", "tanen-sotai"],
    // Unknown or truncated paths land on something usable rather than nothing.
    ["/kamoku/free/nonsense", "free", null],
    ["/kamoku/nonsense", "landing", null],
    ["/kamokuhyo/plan", "landing", null],
    ["/theory", "landing", null],
  ])("reads %s as view=%s area=%s", (pathname, view, area) => {
    expect(parseTrainingPath(pathname)).toEqual({ view, area });
  });
});

describe("trainingPath", () => {
  it.each([
    ["landing", undefined, "/kamoku"],
    ["plan", undefined, "/kamoku/plan"],
    ["free", null, "/kamoku/free"],
    ["free", "randori", "/kamoku/free/randori"],
  ] as const)("builds %s/%s as %s", (view, area, expected) => {
    expect(trainingPath(view, area)).toBe(expected);
  });

  it("round-trips every path it builds", () => {
    for (const area of ["kihon", "hokei", "tanen-sotai", "randori", "embu"] as const) {
      expect(parseTrainingPath(trainingPath("free", area))).toEqual({ view: "free", area });
    }
    expect(parseTrainingPath(trainingPath("plan"))).toEqual({ view: "plan", area: null });
    expect(parseTrainingPath(trainingPath("landing"))).toEqual({ view: "landing", area: null });
  });
});
