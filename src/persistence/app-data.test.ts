import { describe, it, expect, vi } from "vitest";
import { HokeiNotes, HokeiRanks } from "./app-data";
import { AppDataStore } from "./store";
import type { PersistenceBackend } from "./backend";
import type { AppDataDocument } from "./schema";
import { createDefaultAppDataDocument } from "./schema";

function makeStore(): AppDataStore {
  const backend: PersistenceBackend<AppDataDocument> = {
    load: (d) => d,
    save: () => {},
  };
  return new AppDataStore(backend);
}

// ─── HokeiNotes ──────────────────────────────────────────────────────────────

describe("HokeiNotes — getNotes", () => {
  it("returns null when no note exists for the hokei", () => {
    const notes = new HokeiNotes(makeStore());
    expect(notes.getNotes("ippo")).toBeNull();
  });

  it("returns the stored note after setNotes", () => {
    const store = makeStore();
    const notes = new HokeiNotes(store);
    notes.setNotes("ippo", "good technique");
    expect(notes.getNotes("ippo")).toBe("good technique");
  });
});

describe("HokeiNotes — setNotes", () => {
  it("stores a new note", () => {
    const store = makeStore();
    const notes = new HokeiNotes(store);
    notes.setNotes("ippo", "reminder");
    expect(store.get("notes")["ippo"]).toBe("reminder");
  });

  it("overwrites an existing note", () => {
    const store = makeStore();
    const notes = new HokeiNotes(store);
    notes.setNotes("ippo", "first");
    notes.setNotes("ippo", "second");
    expect(store.get("notes")["ippo"]).toBe("second");
  });

  it("does not write to the store when value is unchanged", () => {
    const store = makeStore();
    const notes = new HokeiNotes(store);
    notes.setNotes("ippo", "same");
    const cb = vi.fn();
    store.subscribe("notes", cb);
    notes.setNotes("ippo", "same");
    expect(cb).not.toHaveBeenCalled();
  });

  it("removes the note when null is passed", () => {
    const store = makeStore();
    const notes = new HokeiNotes(store);
    notes.setNotes("ippo", "text");
    notes.setNotes("ippo", null);
    expect(notes.getNotes("ippo")).toBeNull();
    expect("ippo" in store.get("notes")).toBe(false);
  });

  it("is a no-op when clearing a note that does not exist", () => {
    const store = makeStore();
    const notes = new HokeiNotes(store);
    const cb = vi.fn();
    store.subscribe("notes", cb);
    notes.setNotes("ippo", null);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("HokeiNotes — registerListener", () => {
  it("fires callback when the note changes", () => {
    const store = makeStore();
    const notes = new HokeiNotes(store);
    const cb = vi.fn();
    notes.registerListener("ippo", cb);
    notes.setNotes("ippo", "updated");
    expect(cb).toHaveBeenCalledWith("updated");
  });

  it("fires callback with null when note is removed", () => {
    const store = makeStore();
    const notes = new HokeiNotes(store);
    notes.setNotes("ippo", "initial");
    const cb = vi.fn();
    notes.registerListener("ippo", cb);
    notes.setNotes("ippo", null);
    expect(cb).toHaveBeenCalledWith(null);
  });

  it("does not fire callback for a different hokei", () => {
    const store = makeStore();
    const notes = new HokeiNotes(store);
    const cb = vi.fn();
    notes.registerListener("ippo", cb);
    notes.setNotes("nipo", "other");
    expect(cb).not.toHaveBeenCalled();
  });

  it("unregistering stops future callbacks", () => {
    const store = makeStore();
    const notes = new HokeiNotes(store);
    const cb = vi.fn();
    const unsub = notes.registerListener("ippo", cb);
    unsub();
    notes.setNotes("ippo", "after unsub");
    expect(cb).not.toHaveBeenCalled();
  });

  it("unregistering one listener does not affect sibling listeners", () => {
    const store = makeStore();
    const notes = new HokeiNotes(store);
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = notes.registerListener("ippo", cb1);
    notes.registerListener("ippo", cb2);
    unsub1();
    notes.setNotes("ippo", "ping");
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledWith("ping");
  });
});

// ─── HokeiRanks ──────────────────────────────────────────────────────────────

describe("HokeiRanks — getRank", () => {
  it("returns null when no rank exists", () => {
    const ranks = new HokeiRanks(makeStore());
    expect(ranks.getRank("ippo")).toBeNull();
  });

  it("returns the stored rank after setRank", () => {
    const store = makeStore();
    const ranks = new HokeiRanks(store);
    ranks.setRank("ippo", 2);
    expect(ranks.getRank("ippo")).toBe(2);
  });
});

describe("HokeiRanks — setRank", () => {
  it("stores a new rank", () => {
    const store = makeStore();
    const ranks = new HokeiRanks(store);
    ranks.setRank("ippo", 3);
    expect(store.get("hokeiRanks")["ippo"]?.value).toBe(3);
  });

  it("overwrites an existing rank", () => {
    const store = makeStore();
    const ranks = new HokeiRanks(store);
    ranks.setRank("ippo", 1);
    ranks.setRank("ippo", 3);
    expect(ranks.getRank("ippo")).toBe(3);
  });

  it("does not write to the store when value is unchanged", () => {
    const store = makeStore();
    const ranks = new HokeiRanks(store);
    ranks.setRank("ippo", 2);
    const cb = vi.fn();
    store.subscribe("hokeiRanks", cb);
    ranks.setRank("ippo", 2);
    expect(cb).not.toHaveBeenCalled();
  });

  it("removes the rank when null is passed", () => {
    const store = makeStore();
    const ranks = new HokeiRanks(store);
    ranks.setRank("ippo", 1);
    ranks.setRank("ippo", null);
    expect(ranks.getRank("ippo")).toBeNull();
    expect("ippo" in store.get("hokeiRanks")).toBe(false);
  });

  it("is a no-op when clearing a rank that does not exist", () => {
    const store = makeStore();
    const ranks = new HokeiRanks(store);
    const cb = vi.fn();
    store.subscribe("hokeiRanks", cb);
    ranks.setRank("ippo", null);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("HokeiRanks — registerListener", () => {
  it("fires callback when the rank changes", () => {
    const store = makeStore();
    const ranks = new HokeiRanks(store);
    const cb = vi.fn();
    ranks.registerListener("ippo", cb);
    ranks.setRank("ippo", 2);
    expect(cb).toHaveBeenCalledWith(2);
  });

  it("fires callback with null when rank is removed", () => {
    const store = makeStore();
    const ranks = new HokeiRanks(store);
    ranks.setRank("ippo", 1);
    const cb = vi.fn();
    ranks.registerListener("ippo", cb);
    ranks.setRank("ippo", null);
    expect(cb).toHaveBeenCalledWith(null);
  });

  it("does not fire callback for a different hokei", () => {
    const store = makeStore();
    const ranks = new HokeiRanks(store);
    const cb = vi.fn();
    ranks.registerListener("ippo", cb);
    ranks.setRank("nipo", 1);
    expect(cb).not.toHaveBeenCalled();
  });

  it("unregistering stops future callbacks", () => {
    const store = makeStore();
    const ranks = new HokeiRanks(store);
    const cb = vi.fn();
    const unsub = ranks.registerListener("ippo", cb);
    unsub();
    ranks.setRank("ippo", 3);
    expect(cb).not.toHaveBeenCalled();
  });

  it("unregistering one listener does not affect sibling listeners", () => {
    const store = makeStore();
    const ranks = new HokeiRanks(store);
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = ranks.registerListener("ippo", cb1);
    ranks.registerListener("ippo", cb2);
    unsub1();
    ranks.setRank("ippo", 1);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledWith(1);
  });
});

// ─── Restore default store state between tests ────────────────────────────────

// Each test creates its own store via makeStore(), so there is no shared
// singleton state to clean up — the default store export is never used here.
void createDefaultAppDataDocument; // suppress unused-import warning
