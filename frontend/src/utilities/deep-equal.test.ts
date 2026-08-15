import { describe, expect, it } from "vitest";
import { deepEqual } from "./deep-equal";

describe("deepEqual", () => {
  it("compares primitives", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);

    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("a", "b")).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(0, "0")).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
  });

  // The reason this function exists. Two devices that built the same object in a
  // different property order used to compare as different, and the merge read that as
  // a real disagreement and asked the user which device was right.
  it("ignores the order keys were written in", () => {
    expect(deepEqual({ week: 3, anchorDate: "2026-08-01" }, { anchorDate: "2026-08-01", week: 3 })).toBe(true);
    expect(deepEqual({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
  });

  it("compares nested objects by value", () => {
    expect(deepEqual({ a: { b: { c: [1, 2, 3] } } }, { a: { b: { c: [1, 2, 3] } } })).toBe(true);
    expect(deepEqual({ a: { b: { c: [1, 2, 3] } } }, { a: { b: { c: [1, 2, 4] } } })).toBe(false);
  });

  it("compares arrays by order, unlike objects", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual([], [])).toBe(true);
  });

  it("does not confuse an array with an object", () => {
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual({ 0: "a" }, ["a"])).toBe(false);
  });

  it("notices a key present on only one side", () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  // `kenshiNumber: undefined` is how "not set" is spelled in the default document, and
  // the previous JSON-based comparison treated that as absent. Stored documents rely
  // on the two being the same thing.
  it("treats a key set to undefined as absent", () => {
    expect(deepEqual({ a: 1, kenshiNumber: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual({ kenshiNumber: undefined }, {})).toBe(true);
    expect(deepEqual({ a: undefined }, { b: undefined })).toBe(true);
  });

  it("does not treat undefined as equal to null", () => {
    expect(deepEqual({ a: null }, { a: undefined })).toBe(false);
  });

  it("compares the real stored shapes", () => {
    const left = {
      grade: "nidan",
      notes: { "kote nage": "hold the elbow" },
      hokeiRanks: { "kote nage": { value: 2, updatedAt: "2026-08-01T00:00:00Z" } },
      currentWeekAnchor: { week: 3, anchorDate: "2026-08-01" },
    };
    const right = {
      currentWeekAnchor: { anchorDate: "2026-08-01", week: 3 },
      hokeiRanks: { "kote nage": { updatedAt: "2026-08-01T00:00:00Z", value: 2 } },
      notes: { "kote nage": "hold the elbow" },
      grade: "nidan",
    };
    expect(deepEqual(left, right)).toBe(true);
  });

  it("treats NaN as equal to itself, which JSON could not", () => {
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual({ a: NaN }, { a: NaN })).toBe(true);
  });

  it("does not distinguish +0 from -0", () => {
    expect(deepEqual(0, -0)).toBe(true);
  });
});
