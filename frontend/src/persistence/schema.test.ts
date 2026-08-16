import { describe, expect, it } from "vitest";
import { APP_SCHEMA_COMPAT_VERSION, APP_SCHEMA_VERSION, canonicalKenshiNumber, createDefaultAppDataDocument, formatKenshiNumber, isCompleteKenshiNumber, isKenshiNumber, KNOWN_DATA_FIELDS, normalizeKenshiNumber, unknownDataFields } from "./schema";

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

describe("unknownDataFields", () => {
  it("keeps fields written by a newer build", () => {
    const { data } = createDefaultAppDataDocument();
    const withNewer = { ...data, somethingNewerKnows: { a: 1 } };
    expect(unknownDataFields(withNewer)).toEqual({ somethingNewerKnows: { a: 1 } });
  });

  it("keeps nothing from a document this build fully understands", () => {
    expect(unknownDataFields(createDefaultAppDataDocument().data)).toEqual({});
  });

  it("drops retired fields, which are unrecognised but deliberately unwanted", () => {
    const { data } = createDefaultAppDataDocument();
    const withRetired = { ...data, embuDraft: { notes: "x", steps: [] }, futureField: 1 };
    expect(unknownDataFields(withRetired)).toEqual({ futureField: 1 });
  });

  it("tolerates a data field that is not an object", () => {
    expect(unknownDataFields(null)).toEqual({});
    expect(unknownDataFields("nonsense")).toEqual({});
    expect(unknownDataFields([1, 2])).toEqual({});
  });

  it("covers every field of the default document", () => {
    for (const key of Object.keys(createDefaultAppDataDocument().data)) {
      expect(KNOWN_DATA_FIELDS.has(key)).toBe(true);
    }
  });
});

describe("schema versions", () => {
  it("are positive integers", () => {
    expect(Number.isInteger(APP_SCHEMA_VERSION)).toBe(true);
    expect(APP_SCHEMA_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(APP_SCHEMA_COMPAT_VERSION)).toBe(true);
    expect(APP_SCHEMA_COMPAT_VERSION).toBeGreaterThan(0);
  });

  // The whole point of keeping the two apart: this build carries fields it does not
  // recognise through untouched, so it can hold a document written by a newer schema
  // than the one it writes. If these were ever equal, the server could not tell this
  // build from one that drops what it cannot read, and would lock it out of syncing
  // during a rollout it is perfectly safe for.
  it("declare a compatibility ahead of the shape written, because unknown fields are preserved", () => {
    expect(APP_SCHEMA_COMPAT_VERSION).toBeGreaterThan(APP_SCHEMA_VERSION);
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
