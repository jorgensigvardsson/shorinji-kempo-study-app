import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AppDataStore } from "./persistence/store";
import type { PersistenceBackend } from "./persistence/backend";
import type { AppDataDocument } from "./persistence/schema";
import { createDefaultAppDataDocument } from "./persistence/schema";

function makeStore(initial?: AppDataDocument): AppDataStore {
  const backend: PersistenceBackend<AppDataDocument> = {
    load: (defaultDocument) => initial ?? defaultDocument,
    save: () => {},
  };
  return new AppDataStore(backend);
}

describe("hokeiListSelection persistence", () => {
  it("loads default selection 'own' from store", () => {
    const store = makeStore();
    expect(store.get("hokeiListSelection")).toBe("own");
  });

  it("restores persisted selection from store", () => {
    const doc = {
      ...createDefaultAppDataDocument(),
      data: { ...createDefaultAppDataDocument().data, hokeiListSelection: "all" },
    };
    const store = makeStore(doc);
    expect(store.get("hokeiListSelection")).toBe("all");
  });

  it("saves selection changes to store", () => {
    const store = makeStore();
    store.set("hokeiListSelection", "6 kyū");
    expect(store.get("hokeiListSelection")).toBe("6 kyū");
  });

  it("fires listener callback when selection is saved", () => {
    const store = makeStore();
    const callback = vi.fn();
    store.subscribe("hokeiListSelection", callback);
    store.set("hokeiListSelection", "up-to-own");
    expect(callback).toHaveBeenCalledWith("up-to-own");
  });

  it("unregistering listener stops callbacks", () => {
    const store = makeStore();
    const callback = vi.fn();
    const unregister = store.subscribe("hokeiListSelection", callback);
    unregister();
    store.set("hokeiListSelection", "all");
    expect(callback).not.toHaveBeenCalled();
  });

  it("supports multiple listeners on the same setting", () => {
    const store = makeStore();
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    store.subscribe("hokeiListSelection", callback1);
    store.subscribe("hokeiListSelection", callback2);
    store.set("hokeiListSelection", "5 kyū");
    expect(callback1).toHaveBeenCalledWith("5 kyū");
    expect(callback2).toHaveBeenCalledWith("5 kyū");
  });

  it("allows different selection values", () => {
    const store = makeStore();
    const selections = ["all", "own", "up-to-own", "6 kyū", "5 kyū", "shodan"];

    for (const selection of selections) {
      store.set("hokeiListSelection", selection);
      expect(store.get("hokeiListSelection")).toBe(selection);
    }
  });

  it("does not call callback when value is unchanged (Object.is)", () => {
    const store = makeStore();
    const cb = vi.fn();
    store.subscribe("hokeiListSelection", cb);
    store.set("hokeiListSelection", store.get("hokeiListSelection"));
    expect(cb).not.toHaveBeenCalled();
  });
});
