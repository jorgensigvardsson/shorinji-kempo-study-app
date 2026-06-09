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
      hokeiListSelection: "own",
      quizStreakHighScore: 0,
      knownFlashCards: {},
      showKanjiOnHokeiCards: true,
    },
    ...overrides,
  };
}

function makeOldDoc(overrides: Partial<AppDataDocument> & { updatedAt: string }): AppDataDocument {
  const doc = makeDoc(overrides);
  const { hokeiListSelection: _omit, showKanjiOnHokeiCards: _omit2, ...dataWithoutNew } = doc.data;
  return { ...doc, data: dataWithoutNew as AppDataDocument["data"] };
}

function makeDocWithoutKanji(overrides: Partial<AppDataDocument> & { updatedAt: string }): AppDataDocument {
  const doc = makeDoc(overrides);
  const { showKanjiOnHokeiCards: _omit, ...dataWithoutKanji } = doc.data;
  return { ...doc, data: dataWithoutKanji as AppDataDocument["data"] };
}

const OLD = "2024-01-01T00:00:00.000Z";
const NEW = "2024-06-01T00:00:00.000Z";

describe("mergeDocuments — null base", () => {
  it("remote non-default data is applied when local is at defaults", () => {
    const defaults = makeDoc({ updatedAt: OLD }).data;
    const local = makeDoc({ updatedAt: OLD });
    const remote = makeDoc({ updatedAt: NEW, data: { ...defaults, kenshiNumber: "12345" } });
    const result = mergeDocuments(null, local, remote);
    expect(result.document.data.kenshiNumber).toBe("12345");
    expect(result.conflictDetected).toBe(false);
  });

  it("local non-default data is preserved when remote is at defaults", () => {
    const defaults = makeDoc({ updatedAt: OLD }).data;
    const local = makeDoc({ updatedAt: NEW, data: { ...defaults, kenshiNumber: "99999" } });
    const remote = makeDoc({ updatedAt: OLD });
    const result = mergeDocuments(null, local, remote);
    expect(result.document.data.kenshiNumber).toBe("99999");
    expect(result.conflictDetected).toBe(false);
  });

  it("both sides changed from defaults — newer wins with conflict", () => {
    const defaults = makeDoc({ updatedAt: OLD }).data;
    const local = makeDoc({ updatedAt: OLD, data: { ...defaults, kenshiNumber: "11111" } });
    const remote = makeDoc({ updatedAt: NEW, data: { ...defaults, kenshiNumber: "22222" } });
    const result = mergeDocuments(null, local, remote);
    expect(result.document.data.kenshiNumber).toBe("22222");
    expect(result.conflictDetected).toBe(true);
  });

  it("both sides at defaults — no conflict", () => {
    const local = makeDoc({ updatedAt: NEW });
    const remote = makeDoc({ updatedAt: OLD });
    const result = mergeDocuments(null, local, remote);
    expect(result.document.data.grade).toBe("shodan");
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

describe("mergeDocuments — old-version documents missing new fields", () => {
  it("local change to hokeiListSelection is preserved when remote is an old document without the field", () => {
    const base = makeOldDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: NEW, data: { ...makeDoc({ updatedAt: NEW }).data, hokeiListSelection: "all" } });
    const remote = makeOldDoc({ updatedAt: OLD });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.hokeiListSelection).toBe("all");
    expect(result.conflictDetected).toBe(false);
  });

  it("no conflict and default is used when both sides are old documents without the field", () => {
    const base = makeOldDoc({ updatedAt: OLD });
    const local = makeOldDoc({ updatedAt: NEW });
    const remote = makeOldDoc({ updatedAt: OLD });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.hokeiListSelection).toBe("own");
    expect(result.conflictDetected).toBe(false);
  });

  it("remote change to hokeiListSelection is applied when local is an old document without the field", () => {
    const base = makeOldDoc({ updatedAt: OLD });
    const local = makeOldDoc({ updatedAt: OLD });
    const remote = makeDoc({ updatedAt: NEW, data: { ...makeDoc({ updatedAt: NEW }).data, hokeiListSelection: "up-to-own" } });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.hokeiListSelection).toBe("up-to-own");
    expect(result.conflictDetected).toBe(false);
  });
});

describe("mergeDocuments — knownFlashCards", () => {
  const known = (updatedAt: string) => ({ known: true, updatedAt });
  const unlearned = (updatedAt: string) => ({ known: false, updatedAt });

  it("local addition is preserved when remote is empty", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: NEW, data: { ...base.data, knownFlashCards: { "42": known(NEW) } } });
    const remote = makeDoc({ updatedAt: OLD });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.knownFlashCards).toEqual({ "42": known(NEW) });
  });

  it("local swipe wins over stale remote tombstone (3-way merge with base reflecting tombstone)", () => {
    // Reproduces the user-reported bug: base has card marked known:false (an old tombstone),
    // local swipes the card (known:true with current time), remote still has the tombstone.
    // Local changed from base, remote did not — local must win regardless of timestamps.
    const TOMBSTONE = "2099-01-01T00:00:00.000Z"; // remote tombstone with future timestamp
    const SWIPE = "2024-06-01T00:00:00.000Z"; // swipe with earlier timestamp than tombstone
    const base = makeDoc({ updatedAt: OLD, data: { ...makeDoc({ updatedAt: OLD }).data, knownFlashCards: { "42": unlearned(TOMBSTONE) } } });
    const local = makeDoc({ updatedAt: SWIPE, data: { ...base.data, knownFlashCards: { "42": known(SWIPE) } } });
    const remote = makeDoc({ updatedAt: OLD, data: { ...base.data, knownFlashCards: { "42": unlearned(TOMBSTONE) } } });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.knownFlashCards["42"]).toEqual(known(SWIPE));
  });

  it("local removal wins over stale remote known entry (3-way merge)", () => {
    // Base had card as known. User removes locally (sets known:false). Remote still says known:true.
    const base = makeDoc({ updatedAt: OLD, data: { ...makeDoc({ updatedAt: OLD }).data, knownFlashCards: { "42": known(OLD) } } });
    const local = makeDoc({ updatedAt: NEW, data: { ...base.data, knownFlashCards: { "42": unlearned(NEW) } } });
    const remote = makeDoc({ updatedAt: OLD, data: { ...base.data, knownFlashCards: { "42": known(OLD) } } });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.knownFlashCards["42"]).toEqual(unlearned(NEW));
  });

  it("both sides changed differently from base — newer entry wins", () => {
    const T1 = "2024-06-01T00:00:00.000Z";
    const T2 = "2024-07-01T00:00:00.000Z";
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: NEW, data: { ...base.data, knownFlashCards: { "42": known(T1) } } });
    const remote = makeDoc({ updatedAt: NEW, data: { ...base.data, knownFlashCards: { "42": unlearned(T2) } } });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.knownFlashCards["42"]).toEqual(unlearned(T2));
  });

  it("old-format string array on remote is ignored", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: NEW, data: { ...base.data, knownFlashCards: { "42": known(NEW) } } });
    // Simulate a document persisted by the original implementation (string array format).
    const remote = makeDoc({ updatedAt: NEW, data: { ...base.data, knownFlashCards: ["1", "2"] as unknown as Record<string, never> } });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.knownFlashCards["42"]).toEqual(known(NEW));
  });
});

describe("mergeDocuments — showKanjiOnHokeiCards (old-version documents missing the field)", () => {
  it("local change to false is preserved when remote is an old document without the field", () => {
    const base = makeDocWithoutKanji({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: NEW, data: { ...makeDoc({ updatedAt: NEW }).data, showKanjiOnHokeiCards: false } });
    const remote = makeDocWithoutKanji({ updatedAt: OLD });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.showKanjiOnHokeiCards).toBe(false);
    expect(result.conflictDetected).toBe(false);
  });

  it("no conflict and default true is used when both sides are old documents without the field", () => {
    const base = makeDocWithoutKanji({ updatedAt: OLD });
    const local = makeDocWithoutKanji({ updatedAt: NEW });
    const remote = makeDocWithoutKanji({ updatedAt: OLD });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.showKanjiOnHokeiCards).toBe(true);
    expect(result.conflictDetected).toBe(false);
  });

  it("remote change to false is applied when local is an old document without the field", () => {
    const base = makeDocWithoutKanji({ updatedAt: OLD });
    const local = makeDocWithoutKanji({ updatedAt: OLD });
    const remote = makeDoc({ updatedAt: NEW, data: { ...makeDoc({ updatedAt: NEW }).data, showKanjiOnHokeiCards: false } });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.showKanjiOnHokeiCards).toBe(false);
    expect(result.conflictDetected).toBe(false);
  });
});

describe("mergeDocuments — quizStreakHighScore", () => {
  it("takes the higher value when local is higher", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: NEW, data: { ...base.data, quizStreakHighScore: 15 } });
    const remote = makeDoc({ updatedAt: OLD, data: { ...base.data, quizStreakHighScore: 7 } });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.quizStreakHighScore).toBe(15);
  });

  it("takes the higher value when remote is higher", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: OLD, data: { ...base.data, quizStreakHighScore: 3 } });
    const remote = makeDoc({ updatedAt: NEW, data: { ...base.data, quizStreakHighScore: 20 } });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.quizStreakHighScore).toBe(20);
  });

  it("uses zero when neither side has set a score", () => {
    const base = makeDoc({ updatedAt: OLD });
    const local = makeDoc({ updatedAt: NEW });
    const remote = makeDoc({ updatedAt: OLD });
    const result = mergeDocuments(base, local, remote);
    expect(result.document.data.quizStreakHighScore).toBe(0);
  });
});
