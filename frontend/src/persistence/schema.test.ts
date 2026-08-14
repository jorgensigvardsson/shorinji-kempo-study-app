import { describe, expect, it } from "vitest";
import { canonicalKenshiNumber, createDefaultAppDataDocument, formatKenshiNumber, isCompleteKenshiNumber, isKenshiNumber, normalizeKenshiNumber } from "./schema";

describe("createDefaultAppDataDocument", () => {
  it("returns version 1", () => {
    expect(createDefaultAppDataDocument().version).toBe(1);
  });

  it("generates a non-empty string deviceId", () => {
    const { deviceId } = createDefaultAppDataDocument();
    expect(typeof deviceId).toBe("string");
    expect(deviceId.length).toBeGreaterThan(0);
  });

  it("generates unique deviceIds across calls", () => {
    const a = createDefaultAppDataDocument().deviceId;
    const b = createDefaultAppDataDocument().deviceId;
    expect(a).not.toBe(b);
  });

  it("sets updatedAt to within a second of the current time", () => {
    const before = Date.now();
    const { updatedAt } = createDefaultAppDataDocument();
    const after = Date.now();
    const t = Date.parse(updatedAt);
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });

  it("returns expected default data fields", () => {
    const { data } = createDefaultAppDataDocument();
    expect(data.grade).toBe("shodan");
    expect(data.language).toBe("sv");
    expect(data.theme).toBe("system");
    expect(data.syncProvider).toBe("local");
    expect(data.currentWeekAnchor).toBeNull();
    expect(data.kenshiNumber).toBeUndefined();
    expect(data.notes).toEqual({});
    expect(data.hokeiRanks).toEqual({});
    expect(data.knownFlashCards).toEqual({});
    expect(data.quizStreakHighScore).toBe(0);
    expect(data.hokeiListSelection).toBe("own");
    expect(data.gradingFundamentalCompletions).toEqual({});
    expect(data.gradingTheoryCompletions).toEqual({});
    expect("embuDraft" in data).toBe(false);
  });
});

describe("kenshi numbers", () => {
  it("accepts a run of digits", () => {
    expect(isKenshiNumber("12345")).toBe(true);
    expect(isKenshiNumber("0")).toBe(true);
  });

  it("rejects anything that is not digits", () => {
    expect(isKenshiNumber("")).toBe(false);
    expect(isKenshiNumber("SWE-12345")).toBe(false);
    expect(isKenshiNumber("12345 ")).toBe(false);
    expect(isKenshiNumber("12 345")).toBe(false);
  });

  it("normalizes away the separators a number is grouped with when written down", () => {
    expect(normalizeKenshiNumber(" 12 345 ")).toBe("12345");
    expect(normalizeKenshiNumber("123-456789")).toBe("123456789");
    expect(normalizeKenshiNumber("12345")).toBe("12345");
  });

  it("normalizing does not rescue a number that is not digits", () => {
    expect(isKenshiNumber(normalizeKenshiNumber("SWE-12345"))).toBe(false);
  });

  it("accepts both the nine- and ten-digit lengths hombu issues", () => {
    expect(isCompleteKenshiNumber("123-456789")).toBe(true);
    expect(isCompleteKenshiNumber("1234-567890")).toBe(true);
    expect(isCompleteKenshiNumber("123456789")).toBe(true);
    expect(isCompleteKenshiNumber("1234567890")).toBe(true);
  });

  it("rejects lengths no kenshi number has", () => {
    expect(isCompleteKenshiNumber("12345")).toBe(false);
    expect(isCompleteKenshiNumber("12345678901")).toBe(false);
    expect(isCompleteKenshiNumber("")).toBe(false);
  });

  it("stores a nine-digit number as ten digits, with its leading zero", () => {
    expect(canonicalKenshiNumber("123-456789")).toBe("0123456789");
    expect(canonicalKenshiNumber("123456789")).toBe("0123456789");
  });

  it("leaves a ten-digit number as it is", () => {
    expect(canonicalKenshiNumber("1234-567890")).toBe("1234567890");
    expect(canonicalKenshiNumber("0123456789")).toBe("0123456789");
  });

  it("groups a number as [n]nnn-nnnnnn, without the padded leading zero", () => {
    expect(formatKenshiNumber("0123456789")).toBe("123-456789");
    expect(formatKenshiNumber("123456789")).toBe("123-456789");
    expect(formatKenshiNumber("123-456789")).toBe("123-456789");
    expect(formatKenshiNumber("1234567890")).toBe("1234-567890");
    expect(formatKenshiNumber("1234-567890")).toBe("1234-567890");
  });

  it("leaves a number that is not whole alone", () => {
    expect(formatKenshiNumber("12345")).toBe("12345");
    expect(formatKenshiNumber("12345678901")).toBe("12345678901");
    expect(formatKenshiNumber("")).toBe("");
  });
});
