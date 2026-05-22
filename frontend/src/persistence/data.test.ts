import { beforeEach, describe, expect, it, vi } from "vitest";

// Partial mock: keep real AppDataStore, replace only getAppDataStore singleton accessor.
vi.mock("./store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./store")>();
  return { ...actual, getAppDataStore: vi.fn() };
});

import { AppDataStore, getAppDataStore } from "./store";
import type { PersistenceBackend } from "./backend";
import type { AppDataDocument } from "./schema";
import { load } from "./data";

function makeStore(): AppDataStore {
  const backend: PersistenceBackend<AppDataDocument> = { load: (d) => d, save: () => {} };
  return new AppDataStore(backend);
}

// ─── store-backed (mapped) keys ─────────────────────────────────────────────

describe("load — store-backed keys", () => {
  let store: AppDataStore;

  beforeEach(() => {
    store = makeStore();
    vi.mocked(getAppDataStore).mockReturnValue(store);
  });

  it("reads the initial value from the store for 'grade'", () => {
    const data = load("grade", "shodan" as const);
    expect(data.data).toBe("shodan");
  });

  it("save() updates the store for a mapped key", () => {
    const data = load("grade", "shodan" as const);
    data.save("nidan" as const);
    expect(store.get("grade")).toBe("nidan");
  });

  it("registerListener fires when the mapped store key changes", () => {
    const data = load("grade", "shodan" as const);
    const cb = vi.fn();
    data.registerListener(cb);
    store.set("grade", "sandan" as const);
    expect(cb).toHaveBeenCalledWith("sandan");
  });

  it("unregistering stops further callbacks for a mapped key", () => {
    const data = load("grade", "shodan" as const);
    const cb = vi.fn();
    const unregister = data.registerListener(cb);
    unregister();
    store.set("grade", "nidan" as const);
    expect(cb).not.toHaveBeenCalled();
  });

  it("all four mapped key names route through the store", () => {
    const mapped = ["grade", "language", "hokeiListSelection", "quizStreakHighScore"] as const;
    for (const key of mapped) {
      expect(load(key, undefined as never).name).toBe(key);
    }
  });
});

// ─── localStorage-backed (unmapped) keys ─────────────────────────────────────

describe("load — localStorage-backed keys", () => {
  const KEY = "test-unmapped-key";

  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  it("returns defaultData when nothing is stored for an unmapped key", () => {
    expect(load(KEY, 42).data).toBe(42);
  });

  it("reads a previously stored number from localStorage", () => {
    localStorage.setItem(KEY, "99");
    expect(load(KEY, 0).data).toBe(99);
  });

  it("reads a previously stored string as-is", () => {
    localStorage.setItem(KEY, "hello");
    expect(load(KEY, "default").data).toBe("hello");
  });

  it("save() persists a number to localStorage as a JSON string", () => {
    const data = load(KEY, 0);
    data.save(123);
    expect(localStorage.getItem(KEY)).toBe("123");
  });

  it("save() persists a string directly without JSON encoding", () => {
    const data = load(KEY, "default");
    data.save("raw string");
    expect(localStorage.getItem(KEY)).toBe("raw string");
  });

  it("save() persists an object as JSON", () => {
    const data = load(KEY, {});
    data.save({ x: 1 });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ x: 1 });
  });

  it("registerListener fires on save()", () => {
    const data = load(KEY, 0);
    const cb = vi.fn();
    data.registerListener(cb);
    data.save(7);
    expect(cb).toHaveBeenCalledWith(7);
  });

  it("multiple listeners all fire on save()", () => {
    const data = load(KEY, 0);
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    data.registerListener(cb1);
    data.registerListener(cb2);
    data.save(5);
    expect(cb1).toHaveBeenCalledWith(5);
    expect(cb2).toHaveBeenCalledWith(5);
  });

  it("unregistering stops further callbacks", () => {
    const data = load(KEY, 0);
    const cb = vi.fn();
    const unregister = data.registerListener(cb);
    unregister();
    data.save(9);
    expect(cb).not.toHaveBeenCalled();
  });

  it("unregistering one listener does not affect others", () => {
    const data = load(KEY, 0);
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unregister1 = data.registerListener(cb1);
    data.registerListener(cb2);
    unregister1();
    data.save(3);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledWith(3);
  });
});
