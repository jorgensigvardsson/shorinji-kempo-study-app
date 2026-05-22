import { describe, it, expect } from "vitest";
import { resolveCurrentWeekNumber, toLocalDateKey } from "./current-week";

describe("toLocalDateKey", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(toLocalDateKey(new Date(2024, 0, 5))).toBe("2024-01-05");
  });

  it("zero-pads single-digit month and day", () => {
    expect(toLocalDateKey(new Date(2024, 8, 3))).toBe("2024-09-03");
  });

  it("handles December 31", () => {
    expect(toLocalDateKey(new Date(2024, 11, 31))).toBe("2024-12-31");
  });
});

describe("resolveCurrentWeekNumber", () => {
  describe("guard conditions", () => {
    it("returns 1 when totalWeeks is 0", () => {
      expect(resolveCurrentWeekNumber({ week: 1, anchorDate: "2024-01-01" }, 0, "2024-01-01")).toBe(1);
    });

    it("returns 1 when totalWeeks is negative", () => {
      expect(resolveCurrentWeekNumber({ week: 1, anchorDate: "2024-01-01" }, -5, "2024-01-01")).toBe(1);
    });

    it("returns 1 when anchor is null", () => {
      expect(resolveCurrentWeekNumber(null, 10, "2024-01-01")).toBe(1);
    });

    it("returns 1 when anchor.week is NaN", () => {
      expect(resolveCurrentWeekNumber({ week: NaN, anchorDate: "2024-01-01" }, 10, "2024-01-01")).toBe(1);
    });

    it("returns 1 when anchor.week is Infinity", () => {
      expect(resolveCurrentWeekNumber({ week: Infinity, anchorDate: "2024-01-01" }, 10, "2024-01-01")).toBe(1);
    });
  });

  describe("same day as anchor", () => {
    it("returns the anchor week when today equals the anchor date", () => {
      expect(resolveCurrentWeekNumber({ week: 3, anchorDate: "2024-01-01" }, 10, "2024-01-01")).toBe(3);
    });

    it("returns 1 when anchor week is 1 and no days have elapsed", () => {
      expect(resolveCurrentWeekNumber({ week: 1, anchorDate: "2024-01-01" }, 10, "2024-01-01")).toBe(1);
    });
  });

  describe("advancing weeks", () => {
    it("advances by 1 after 7 days", () => {
      expect(resolveCurrentWeekNumber({ week: 1, anchorDate: "2024-01-01" }, 10, "2024-01-08")).toBe(2);
    });

    it("advances by 2 after 14 days", () => {
      expect(resolveCurrentWeekNumber({ week: 1, anchorDate: "2024-01-01" }, 10, "2024-01-15")).toBe(3);
    });

    it("does not advance mid-week (day 6)", () => {
      expect(resolveCurrentWeekNumber({ week: 1, anchorDate: "2024-01-01" }, 10, "2024-01-07")).toBe(1);
    });
  });

  describe("week wrapping", () => {
    it("wraps from last week back to week 1 after 7 days", () => {
      expect(resolveCurrentWeekNumber({ week: 10, anchorDate: "2024-01-01" }, 10, "2024-01-08")).toBe(1);
    });

    it("wraps multiple times correctly", () => {
      // anchor week 1, totalWeeks 4 — after 28 days we're back to week 1
      expect(resolveCurrentWeekNumber({ week: 1, anchorDate: "2024-01-01" }, 4, "2024-01-29")).toBe(1);
    });

    it("handles anchor week > totalWeeks by normalising", () => {
      // week 11 with 10 total → normalised to 1; no days elapsed → week 1
      expect(resolveCurrentWeekNumber({ week: 11, anchorDate: "2024-01-01" }, 10, "2024-01-01")).toBe(1);
    });
  });

  describe("invalid anchor date", () => {
    it("falls back to todayKey when anchorDate is malformed", () => {
      // anchorDate is invalid, so todayKey is used as the anchor → 0 elapsed days → anchor week
      expect(resolveCurrentWeekNumber({ week: 5, anchorDate: "not-a-date" }, 10, "2024-01-01")).toBe(5);
    });
  });

  describe("anchor in the future (negative elapsed days)", () => {
    it("handles a future anchor date without returning a negative week", () => {
      const result = resolveCurrentWeekNumber({ week: 3, anchorDate: "2024-02-01" }, 10, "2024-01-01");
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(10);
    });
  });

  describe("fractional anchor week", () => {
    it("floors a fractional anchor week", () => {
      // 1.9 floors to 1; same day → week 1
      expect(resolveCurrentWeekNumber({ week: 1.9, anchorDate: "2024-01-01" }, 10, "2024-01-01")).toBe(1);
    });
  });
});
