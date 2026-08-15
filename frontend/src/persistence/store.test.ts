import { describe, it, expect, vi } from "vitest";
import { AppDataStore } from "./store";
import type { PersistenceBackend } from "./backend";
import type { AppDataDocument } from "./schema";
import { createDefaultAppDataDocument } from "./schema";

function makeBackend(initial?: AppDataDocument): PersistenceBackend<AppDataDocument> {
  let stored = initial ?? null;
  return {
    load: (defaultDocument) => stored ?? defaultDocument,
    save: (document) => { stored = document; },
  };
}

function makeStore(initial?: AppDataDocument): AppDataStore {
  return new AppDataStore(makeBackend(initial));
}

describe("AppDataStore — initial state", () => {
  it("returns default grade when nothing is persisted", () => {
    const store = makeStore();
    expect(store.get("grade")).toBe("shodan");
  });

  it("restores persisted state from the backend", () => {
    const doc = { ...createDefaultAppDataDocument(), data: { ...createDefaultAppDataDocument().data, grade: "nidan" as const } };
    const store = makeStore(doc);
    expect(store.get("grade")).toBe("nidan");
  });

  it("adds empty weekly-plan completions to older saved documents", () => {
    const current = createDefaultAppDataDocument();
    const oldData = { ...current.data } as Partial<AppDataDocument["data"]>;
    delete oldData.weeklyPlanCompletions;
    const store = makeStore({ ...current, data: oldData as AppDataDocument["data"] });

    expect(store.get("weeklyPlanCompletions")).toEqual({});
  });

  it("adds empty grading completions to older saved documents", () => {
    const current = createDefaultAppDataDocument();
    const oldData = { ...current.data } as Partial<AppDataDocument["data"]>;
    delete oldData.gradingFundamentalCompletions;
    const store = makeStore({ ...current, data: oldData as AppDataDocument["data"] });

    expect(store.get("gradingFundamentalCompletions")).toEqual({});
  });

  it("adds empty theory grading completions to older saved documents", () => {
    const current = createDefaultAppDataDocument();
    const oldData = { ...current.data } as Partial<AppDataDocument["data"]>;
    delete oldData.gradingTheoryCompletions;
    const store = makeStore({ ...current, data: oldData as AppDataDocument["data"] });

    expect(store.get("gradingTheoryCompletions")).toEqual({});
  });
});

// A build that drops what it does not recognise deletes it for every one of the user's
// devices the moment it syncs. These cover the store's half of not doing that.
describe("AppDataStore — fields from a newer build", () => {
  function docWithNewerField(): AppDataDocument {
    const doc = createDefaultAppDataDocument();
    return { ...doc, data: { ...doc.data, fieldFromTheFuture: { keep: "me" } } as AppDataDocument["data"] };
  }

  it("preserves them when loading a stored document", () => {
    const store = makeStore(docWithNewerField());
    const data = store.getDocument().data as AppDataDocument["data"] & { fieldFromTheFuture?: unknown };
    expect(data.fieldFromTheFuture).toEqual({ keep: "me" });
  });

  it("preserves them across a write of a known field", () => {
    const store = makeStore(docWithNewerField());
    store.set("grade", "nidan");
    const data = store.getDocument().data as AppDataDocument["data"] & { fieldFromTheFuture?: unknown };
    expect(data.grade).toBe("nidan");
    expect(data.fieldFromTheFuture).toEqual({ keep: "me" });
  });

  it("preserves them when a synced document is applied", () => {
    const store = makeStore();
    store.setDocument(docWithNewerField());
    const data = store.getDocument().data as AppDataDocument["data"] & { fieldFromTheFuture?: unknown };
    expect(data.fieldFromTheFuture).toEqual({ keep: "me" });
  });

  it("does not fail applying a document carrying a field it has no subscribers for", () => {
    const store = makeStore();
    expect(() => store.setDocument(docWithNewerField())).not.toThrow();
  });

  it("still drops retired fields", () => {
    const doc = createDefaultAppDataDocument();
    const store = makeStore({ ...doc, data: { ...doc.data, embuDraft: { notes: "", steps: [] } } as AppDataDocument["data"] });
    expect("embuDraft" in store.getDocument().data).toBe(false);
  });

  it("still validates the fields it does know", () => {
    const doc = createDefaultAppDataDocument();
    const store = makeStore({
      ...doc,
      data: { ...doc.data, quizStreakHighScore: "not a number", fieldFromTheFuture: 1 } as unknown as AppDataDocument["data"],
    });
    expect(store.get("quizStreakHighScore")).toBe(0);
  });
});

describe("AppDataStore — get / set", () => {
  it("set updates the value returned by get", () => {
    const store = makeStore();
    store.set("grade", "sandan");
    expect(store.get("grade")).toBe("sandan");
  });

  it("set does not call callbacks when value is identical (Object.is)", () => {
    const store = makeStore();
    const cb = vi.fn();
    store.subscribe("grade", cb);
    store.set("grade", store.get("grade"));
    expect(cb).not.toHaveBeenCalled();
  });

  it("set persists the new value to the backend", () => {
    const save = vi.fn<(document: AppDataDocument) => void>();
    const backend: PersistenceBackend<AppDataDocument> = { load: (d) => d, save };
    const store = new AppDataStore(backend);
    store.set("grade", "yondan");
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.lastCall?.[0].data.grade).toBe("yondan");
  });
});

describe("AppDataStore — subscribe", () => {
  it("fires the callback when the subscribed key changes", () => {
    const store = makeStore();
    const cb = vi.fn();
    store.subscribe("grade", cb);
    store.set("grade", "nidan");
    expect(cb).toHaveBeenCalledWith("nidan");
  });

  it("does not fire the callback for a different key", () => {
    const store = makeStore();
    const cb = vi.fn();
    store.subscribe("grade", cb);
    store.set("language", "en");
    expect(cb).not.toHaveBeenCalled();
  });

  it("unregistering stops future callbacks", () => {
    const store = makeStore();
    const cb = vi.fn();
    const unregister = store.subscribe("grade", cb);
    unregister();
    store.set("grade", "nidan");
    expect(cb).not.toHaveBeenCalled();
  });

  it("supports multiple subscribers on the same key", () => {
    const store = makeStore();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    store.subscribe("grade", cb1);
    store.subscribe("grade", cb2);
    store.set("grade", "godan");
    expect(cb1).toHaveBeenCalledWith("godan");
    expect(cb2).toHaveBeenCalledWith("godan");
  });

  it("unregistering one subscriber does not affect others", () => {
    const store = makeStore();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unregister1 = store.subscribe("grade", cb1);
    store.subscribe("grade", cb2);
    unregister1();
    store.set("grade", "rokudan");
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledWith("rokudan");
  });
});

describe("AppDataStore — subscribeDocument", () => {
  it("fires document callback when any key changes via set", () => {
    const store = makeStore();
    const cb = vi.fn();
    store.subscribeDocument(cb);
    store.set("grade", "nidan");
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].data.grade).toBe("nidan");
  });

  it("unregistering document subscription stops future callbacks", () => {
    const store = makeStore();
    const cb = vi.fn();
    const unregister = store.subscribeDocument(cb);
    unregister();
    store.set("grade", "nidan");
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("AppDataStore — getDocument", () => {
  it("returns a clone — mutating it does not affect the store", () => {
    const store = makeStore();
    const doc = store.getDocument();
    (doc.data as { grade: string }).grade = "kudan";
    expect(store.get("grade")).toBe("shodan");
  });
});

describe("AppDataStore — setDocument", () => {
  it("updates all keys in the document", () => {
    const store = makeStore();
    const newDoc = { ...createDefaultAppDataDocument(), data: { ...createDefaultAppDataDocument().data, grade: "kudan" as const, language: "en" as const } };
    store.setDocument(newDoc);
    expect(store.get("grade")).toBe("kudan");
    expect(store.get("language")).toBe("en");
  });

  it("fires key subscribers only for changed keys", () => {
    const store = makeStore();
    const gradeCb = vi.fn();
    const langCb = vi.fn();
    store.subscribe("grade", gradeCb);
    store.subscribe("language", langCb);
    const newDoc = { ...store.getDocument(), data: { ...store.getDocument().data, grade: "nidan" as const } };
    store.setDocument(newDoc);
    expect(gradeCb).toHaveBeenCalledWith("nidan");
    expect(langCb).not.toHaveBeenCalled();
  });

  it("fires the document subscriber after setDocument", () => {
    const store = makeStore();
    const cb = vi.fn();
    store.subscribeDocument(cb);
    store.setDocument(createDefaultAppDataDocument());
    expect(cb).toHaveBeenCalledOnce();
  });
});
