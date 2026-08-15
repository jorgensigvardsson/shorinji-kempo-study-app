import { beforeEach, describe, expect, it, vi } from "vitest";

// Each test gets the module fresh, because which sections are held is module-level
// state that a previous test would otherwise have already filled in. Safe to reset
// here: this module imports JSON and types only, so nothing gets a second copy of
// React out of it.
const freshModule = () => import("./translations");

beforeEach(() => {
  vi.resetModules();
});

describe("translations", () => {
  it("starts with the sections that ship with the app, and only those", async () => {
    const { getTranslations } = await freshModule();
    const held = getTranslations();

    // Japanese sits beside every technique name; English is asked for by name on the
    // dojo cards. Both have to be there before anything renders.
    expect(Object.keys(held).sort()).toEqual(["en", "ja"]);
    expect(held.ja["1 kyū"]).toBe("１級");
    expect(held.en["Träning"]).toBeDefined();
  });

  // Swedish is the source language: the keys are the Swedish text, so there is no
  // section to fetch and asking for one must not hang.
  it.each(["sv", "en", "ja"] as const)("resolves immediately for %s", async language => {
    const { ensureTranslations, getTranslations } = await freshModule();
    const before = getTranslations();

    await ensureTranslations(language);

    expect(getTranslations()).toBe(before);
  });

  it("fetches Turkish on demand and serves it afterwards", async () => {
    const { ensureTranslations, getTranslations } = await freshModule();
    expect(getTranslations().tr).toBeUndefined();

    await ensureTranslations("tr");

    expect(getTranslations().tr).toBeDefined();
    expect(getTranslations().tr["Träning"]).toBeDefined();
  });

  // The identity change is what tells useSyncExternalStore that something happened;
  // mutating the held object in place would leave the interface in Swedish.
  it("replaces the object and notifies when a section arrives", async () => {
    const { ensureTranslations, getTranslations, subscribeTranslations } = await freshModule();
    const before = getTranslations();
    let notified = 0;
    subscribeTranslations(() => { notified += 1; });

    await ensureTranslations("tr");

    expect(notified).toBe(1);
    expect(getTranslations()).not.toBe(before);
    // The sections already held survive the arrival of a new one.
    expect(getTranslations().ja).toBe(before.ja);
    expect(getTranslations().en).toBe(before.en);
  });

  it("does not notify again for a section it already holds", async () => {
    const { ensureTranslations, subscribeTranslations } = await freshModule();
    await ensureTranslations("tr");

    let notified = 0;
    subscribeTranslations(() => { notified += 1; });
    await ensureTranslations("tr");

    expect(notified).toBe(0);
  });

  // Two callers can ask at once — App's effect and the Settings preload, say. The
  // second must not replace the object a second time for no change.
  it("notifies once when asked concurrently", async () => {
    const { ensureTranslations, subscribeTranslations } = await freshModule();
    let notified = 0;
    subscribeTranslations(() => { notified += 1; });

    await Promise.all([ensureTranslations("tr"), ensureTranslations("tr"), ensureTranslations("tr")]);

    expect(notified).toBe(1);
  });

  it("ensureAllTranslations leaves nothing to fetch", async () => {
    const { ensureAllTranslations, ensureTranslations, getTranslations, subscribeTranslations } = await freshModule();
    await ensureAllTranslations();

    let notified = 0;
    subscribeTranslations(() => { notified += 1; });
    for (const language of ["sv", "en", "ja", "tr"] as const) await ensureTranslations(language);

    expect(notified).toBe(0);
    expect(Object.keys(getTranslations()).sort()).toEqual(["en", "ja", "tr"]);
  });

  it("stops notifying after unsubscribe", async () => {
    const { ensureTranslations, subscribeTranslations } = await freshModule();
    let notified = 0;
    const unsubscribe = subscribeTranslations(() => { notified += 1; });
    unsubscribe();

    await ensureTranslations("tr");

    expect(notified).toBe(0);
  });
});
