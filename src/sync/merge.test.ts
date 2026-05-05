import { describe, it, expect } from "vitest";
import { mergeDocuments } from "./merge";
import type { AppDataDocument } from "../persistence/schema";

function makeDoc(overrides: Partial<AppDataDocument> & { updatedAt: string }): AppDataDocument {
  return {
    version: 1,
    deviceId: "device-a",
    data: {
      grade: "shodan",
      language: "sv",
      theme: "system",
      currentWeekAnchor: null,
      syncProvider: "local",
      kenshiNumber: undefined,
      notes: {},
      hokeiRanks: {},
    },
    ...overrides,
  };
}

const OLD = "2024-01-01T00:00:00.000Z";
const NEW = "2024-06-01T00:00:00.000Z";

describe("mergeDocuments — null base", () => {
  it("returns local when local is newer", () => {
    const local = makeDoc({ updatedAt: NEW });
    const remote = makeDoc({ updatedAt: OLD });
    const result = mergeDocuments(null, local, remote);
    expect(result.document).toEqual(local);
    expect(result.conflictDetected).toBe(false);
  });

  it("returns remote when remote is newer", () => {
    const local = makeDoc({ updatedAt: OLD });
    const remote = makeDoc({ updatedAt: NEW, deviceId: "device-b" });
    const result = mergeDocuments(null, local, remote);
    expect(result.document).toEqual(remote);
    expect(result.conflictDetected).toBe(false);
  });

  it("returns local when timestamps are equal", () => {
    const local = makeDoc({ updatedAt: NEW });
    const remote = makeDoc({ updatedAt: NEW, deviceId: "device-b" });
    const result = mergeDocuments(null, local, remote);
    expect(result.document).toEqual(local);
    expect(result.conflictDetected).toBe(false);
  });
});

describe("mergeDocuments — scalar fields", () => {
  it("uses local value when only local changed", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: NEW, data: { ...base.data, grade: "nidan" } });
    const remote = makeDoc({ updatedAt: OLD });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.grade).toBe("nidan");
    expect(result.conflictDetected).toBe(false);
  });

  it("uses remote value when only remote changed", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: OLD });
    const remote = makeDoc({ updatedAt: NEW, data: { ...base.data, grade: "sandan" } });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.grade).toBe("sandan");
    expect(result.conflictDetected).toBe(false);
  });

  it("uses base value when neither side changed", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: OLD });
    const remote = makeDoc({ updatedAt: OLD });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.grade).toBe("shodan");
    expect(result.conflictDetected).toBe(false);
  });

  it("no conflict when both sides changed to same value", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: NEW, data: { ...base.data, grade: "nidan" } });
    const remote = makeDoc({ updatedAt: NEW, data: { ...base.data, grade: "nidan" } });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.grade).toBe("nidan");
    expect(result.conflictDetected).toBe(false);
  });

  it("conflict: both sides changed to different values — newer document wins", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: OLD, data: { ...base.data, grade: "nidan" } });
    const remote = makeDoc({ updatedAt: NEW, data: { ...base.data, grade: "sandan" } });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.grade).toBe("sandan");
    expect(result.conflictDetected).toBe(true);
  });
});

describe("mergeDocuments — output document metadata", () => {
  it("version is max of local and remote", () => {
    const base = makeDoc({ updatedAt: OLD, version: 1 });
    const local = makeDoc({ updatedAt: NEW, version: 3 });
    const remote = makeDoc({ updatedAt: OLD, version: 5 });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.version).toBe(5);
  });

  it("updatedAt is the later of local and remote", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: OLD });
    const remote = makeDoc({ updatedAt: NEW });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.updatedAt).toBe(NEW);
  });
});

describe("mergeDocuments — notes", () => {
  it("local-only addition is kept", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: NEW, data: { ...base.data, notes: { a: "hello" } } });
    const remote = makeDoc({ updatedAt: OLD });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.notes).toEqual({ a: "hello" });
    expect(result.conflictDetected).toBe(false);
  });

  it("remote-only addition is kept", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: OLD });
    const remote = makeDoc({ updatedAt: NEW, data: { ...base.data, notes: { b: "world" } } });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.notes).toEqual({ b: "world" });
    expect(result.conflictDetected).toBe(false);
  });

  it("independent additions from both sides are all kept", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: NEW, data: { ...base.data, notes: { a: "local" } } });
    const remote = makeDoc({ updatedAt: NEW, data: { ...base.data, notes: { b: "remote" } } });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.notes).toEqual({ a: "local", b: "remote" });
    expect(result.conflictDetected).toBe(false);
  });

  it("conflict on same note key — newer document's value wins", () => {
    const base = makeDoc({ updatedAt: OLD, data: { ...makeDoc({ updatedAt: OLD }).data, notes: { x: "base" } } });
    const local = makeDoc({ updatedAt: OLD, data: { ...base.data, notes: { x: "local edit" } } });
    const remote = makeDoc({ updatedAt: NEW, data: { ...base.data, notes: { x: "remote edit" } } });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.notes.x).toBe("remote edit");
    expect(result.conflictDetected).toBe(true);
  });

  it("conflict marker is not present in the output notes", () => {
    const base = makeDoc({ updatedAt: OLD, data: { ...makeDoc({ updatedAt: OLD }).data, notes: { x: "base" } } });
    const local = makeDoc({ updatedAt: OLD, data: { ...base.data, notes: { x: "local" } } });
    const remote = makeDoc({ updatedAt: NEW, data: { ...base.data, notes: { x: "remote" } } });
    const result = mergeDocuments(base, local, remote);
    expect("__conflictMarker" in result.document.data.notes).toBe(false);
  });

  it("deletion on one side is kept when other side unchanged", () => {
    const base = makeDoc({ updatedAt: OLD, data: { ...makeDoc({ updatedAt: OLD }).data, notes: { a: "text" } } });
    const local = makeDoc({ updatedAt: NEW, data: { ...base.data, notes: {} } });
    const remote = makeDoc({ updatedAt: OLD, data: { ...base.data, notes: { a: "text" } } });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.notes).toEqual({});
  });
});

describe("mergeDocuments — hokeiRanks", () => {
  const rank1 = { value: 1 as const, updatedAt: OLD };
  const rank2 = { value: 2 as const, updatedAt: NEW };
  const rank3 = { value: 3 as const, updatedAt: NEW };

  it("local-only rank addition is kept", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: NEW, data: { ...base.data, hokeiRanks: { "ippo": rank1 } } });
    const remote = makeDoc({ updatedAt: OLD });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.hokeiRanks).toEqual({ "ippo": rank1 });
  });

  it("conflict on same rank key — individual rank updatedAt used as tiebreak", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: NEW, data: { ...base.data, hokeiRanks: { "ippo": rank1 } } });
    const remote = makeDoc({ updatedAt: NEW, data: { ...base.data, hokeiRanks: { "ippo": rank2 } } });
    // rank2 has updatedAt=NEW, rank1 has updatedAt=OLD → rank2 wins
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.hokeiRanks["ippo"]).toEqual(rank2);
    expect(result.conflictDetected).toBe(true);
  });

  it("conflict marker is not present in output hokeiRanks", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: NEW, data: { ...base.data, hokeiRanks: { "ippo": rank1 } } });
    const remote = makeDoc({ updatedAt: NEW, data: { ...base.data, hokeiRanks: { "ippo": rank3 } } });
    const result = mergeDocuments(base, local, remote);
    expect("__conflictMarker" in result.document.data.hokeiRanks).toBe(false);
  });

  it("no conflict when both sides set identical rank", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: NEW, data: { ...base.data, hokeiRanks: { "ippo": rank1 } } });
    const remote = makeDoc({ updatedAt: NEW, data: { ...base.data, hokeiRanks: { "ippo": rank1 } } });
    const result = mergeDocuments(base, local, remote);
    expect(result.conflictDetected).toBe(false);
  });
});
