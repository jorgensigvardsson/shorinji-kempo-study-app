import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("./store", async importOriginal => ({
  ...(await importOriginal<typeof import("./store")>()),
  getAppDataStore: vi.fn(),
}));

import { getAppDataStore, AppDataStore } from "./store";
import { setHokeiNote, setHokeiRank, useHokeiNote, useHokeiRank } from "./app-data";
import type { PersistenceBackend } from "./backend";
import type { AppDataDocument } from "./schema";

let store: AppDataStore;

beforeEach(() => {
  const backend: PersistenceBackend<AppDataDocument> = { load: d => d, save: () => {} };
  store = new AppDataStore(backend);
  vi.mocked(getAppDataStore).mockImplementation(() => store);
});

// ─── notes ───────────────────────────────────────────────────────────────────

describe("setHokeiNote", () => {
  it("stores a new note", () => {
    setHokeiNote("ippo", "reminder");
    expect(store.get("notes")["ippo"]).toBe("reminder");
  });

  it("overwrites an existing note", () => {
    setHokeiNote("ippo", "first");
    setHokeiNote("ippo", "second");
    expect(store.get("notes")["ippo"]).toBe("second");
  });

  it("does not write to the store when the value is unchanged", () => {
    setHokeiNote("ippo", "same");
    const cb = vi.fn();
    store.subscribe("notes", cb);
    setHokeiNote("ippo", "same");
    expect(cb).not.toHaveBeenCalled();
  });

  it("removes the note when null is passed", () => {
    setHokeiNote("ippo", "text");
    setHokeiNote("ippo", null);
    expect("ippo" in store.get("notes")).toBe(false);
  });

  it("is a no-op when clearing a note that does not exist", () => {
    const cb = vi.fn();
    store.subscribe("notes", cb);
    setHokeiNote("ippo", null);
    expect(cb).not.toHaveBeenCalled();
  });

  it("leaves other techniques' notes alone", () => {
    setHokeiNote("ippo", "one");
    setHokeiNote("nipo", "two");
    setHokeiNote("ippo", null);
    expect(store.get("notes")["nipo"]).toBe("two");
  });
});

describe("useHokeiNote", () => {
  it("returns null when no note exists for the technique", () => {
    const { result } = renderHook(() => useHokeiNote("ippo"));
    expect(result.current).toBeNull();
  });

  it("returns the stored note", () => {
    setHokeiNote("ippo", "good technique");
    const { result } = renderHook(() => useHokeiNote("ippo"));
    expect(result.current).toBe("good technique");
  });

  it("updates when the note changes", () => {
    const { result } = renderHook(() => useHokeiNote("ippo"));
    act(() => setHokeiNote("ippo", "updated"));
    expect(result.current).toBe("updated");
  });

  it("reports null once the note is removed", () => {
    setHokeiNote("ippo", "initial");
    const { result } = renderHook(() => useHokeiNote("ippo"));
    act(() => setHokeiNote("ippo", null));
    expect(result.current).toBeNull();
  });

  // The property that used to need a hand-rolled Map of per-technique listeners:
  // one card's note changing must not re-render every other card on screen.
  it("does not re-render when a different technique's note changes", () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useHokeiNote("ippo");
    });
    const rendersAfterMount = renders;

    act(() => setHokeiNote("nipo", "other"));

    expect(renders).toBe(rendersAfterMount);
  });

  it("stops listening once unmounted", () => {
    let renders = 0;
    const { unmount } = renderHook(() => {
      renders++;
      return useHokeiNote("ippo");
    });
    const rendersAtUnmount = renders;

    unmount();
    act(() => setHokeiNote("ippo", "after unmount"));

    expect(renders).toBe(rendersAtUnmount);
  });
});

// ─── ranks ───────────────────────────────────────────────────────────────────

describe("setHokeiRank", () => {
  it("stores a new rank", () => {
    setHokeiRank("ippo", 3);
    expect(store.get("hokeiRanks")["ippo"]?.value).toBe(3);
  });

  it("overwrites an existing rank", () => {
    setHokeiRank("ippo", 1);
    setHokeiRank("ippo", 3);
    expect(store.get("hokeiRanks")["ippo"]?.value).toBe(3);
  });

  it("does not write to the store when the value is unchanged", () => {
    setHokeiRank("ippo", 2);
    const cb = vi.fn();
    store.subscribe("hokeiRanks", cb);
    setHokeiRank("ippo", 2);
    expect(cb).not.toHaveBeenCalled();
  });

  it("keeps the original updatedAt when the same rank is written again", () => {
    setHokeiRank("ippo", 2);
    const first = store.get("hokeiRanks")["ippo"]?.updatedAt;
    setHokeiRank("ippo", 2);
    expect(store.get("hokeiRanks")["ippo"]?.updatedAt).toBe(first);
  });

  it("removes the rank when null is passed", () => {
    setHokeiRank("ippo", 1);
    setHokeiRank("ippo", null);
    expect("ippo" in store.get("hokeiRanks")).toBe(false);
  });

  it("is a no-op when clearing a rank that does not exist", () => {
    const cb = vi.fn();
    store.subscribe("hokeiRanks", cb);
    setHokeiRank("ippo", null);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("useHokeiRank", () => {
  it("returns null when no rank exists", () => {
    const { result } = renderHook(() => useHokeiRank("ippo"));
    expect(result.current).toBeNull();
  });

  it("returns the stored rank", () => {
    setHokeiRank("ippo", 2);
    const { result } = renderHook(() => useHokeiRank("ippo"));
    expect(result.current).toBe(2);
  });

  it("updates when the rank changes", () => {
    const { result } = renderHook(() => useHokeiRank("ippo"));
    act(() => setHokeiRank("ippo", 2));
    expect(result.current).toBe(2);
  });

  it("reports null once the rank is cleared", () => {
    setHokeiRank("ippo", 1);
    const { result } = renderHook(() => useHokeiRank("ippo"));
    act(() => setHokeiRank("ippo", null));
    expect(result.current).toBeNull();
  });

  it("does not re-render when a different technique's rank changes", () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useHokeiRank("ippo");
    });
    const rendersAfterMount = renders;

    act(() => setHokeiRank("nipo", 1));

    expect(renders).toBe(rendersAfterMount);
  });
});
