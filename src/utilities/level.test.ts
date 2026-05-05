import { describe, it, expect } from "vitest";
import { compareGrades, compareGradeThenWeek } from "./level";
import type { GradeName } from "../data";

describe("compareGrades", () => {
  it("returns 0 for identical grades", () => {
    expect(compareGrades("shodan", "shodan")).toBe(0);
  });

  it("orders kyū grades: lower kyū number is a higher rank", () => {
    // 1 kyū is higher than 6 kyū → comes after in ascending sort
    expect(compareGrades("1 kyū", "6 kyū")).toBeGreaterThan(0);
    expect(compareGrades("6 kyū", "1 kyū")).toBeLessThan(0);
  });

  it("orders dan grades ascending", () => {
    expect(compareGrades("nidan", "shodan")).toBeGreaterThan(0);
    expect(compareGrades("shodan", "nidan")).toBeLessThan(0);
  });

  it("kudan is the highest grade", () => {
    const belowKudan: GradeName[] = ["hachidan", "godan", "shodan", "1 kyū", "6 kyū"];
    for (const g of belowKudan) {
      expect(compareGrades("kudan", g)).toBeGreaterThan(0);
    }
  });

  it("6 kyū is the lowest grade", () => {
    const aboveSixKyu: GradeName[] = ["5 kyū", "1 kyū", "shodan", "kudan"];
    for (const g of aboveSixKyu) {
      expect(compareGrades("6 kyū", g)).toBeLessThan(0);
    }
  });

  it("dan grades rank above all kyū grades", () => {
    expect(compareGrades("shodan", "1 kyū")).toBeGreaterThan(0);
  });

  it("throws for an unrecognized grade", () => {
    expect(() => compareGrades("unknown" as GradeName, "shodan")).toThrow();
  });

  it("full ascending order is consistent", () => {
    const grades: GradeName[] = [
      "6 kyū", "5 kyū", "4 kyū", "3 kyū", "2 kyū", "1 kyū",
      "shodan", "nidan", "sandan", "yondan", "godan",
      "rokudan", "nanadan", "hachidan", "kudan",
    ];
    for (let i = 0; i < grades.length - 1; i++) {
      expect(compareGrades(grades[i], grades[i + 1])).toBeLessThan(0);
    }
  });
});

describe("compareGradeThenWeek", () => {
  it("orders by grade first when grades differ", () => {
    const a = { grade: "shodan" as GradeName, week: 10 };
    const b = { grade: "nidan" as GradeName, week: 1 };
    expect(compareGradeThenWeek(a, b)).toBeLessThan(0);
  });

  it("orders by week when grades are equal", () => {
    const a = { grade: "shodan" as GradeName, week: 1 };
    const b = { grade: "shodan" as GradeName, week: 5 };
    expect(compareGradeThenWeek(a, b)).toBeLessThan(0);
    expect(compareGradeThenWeek(b, a)).toBeGreaterThan(0);
  });

  it("returns 0 when grade and week are equal and no momentIndex", () => {
    const a = { grade: "shodan" as GradeName, week: 3 };
    const b = { grade: "shodan" as GradeName, week: 3 };
    expect(compareGradeThenWeek(a, b)).toBe(0);
  });

  it("uses momentIndex as tiebreak when grade and week are equal", () => {
    const a = { grade: "shodan" as GradeName, week: 3, momentIndex: 0 };
    const b = { grade: "shodan" as GradeName, week: 3, momentIndex: 2 };
    expect(compareGradeThenWeek(a, b)).toBeLessThan(0);
  });

  it("treats missing momentIndex as 0", () => {
    const a = { grade: "shodan" as GradeName, week: 3 };
    const b = { grade: "shodan" as GradeName, week: 3, momentIndex: 0 };
    expect(compareGradeThenWeek(a, b)).toBe(0);
  });
});
