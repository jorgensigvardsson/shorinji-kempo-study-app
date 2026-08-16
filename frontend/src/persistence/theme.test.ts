import { describe, it, expect, beforeEach } from "vitest";
import {
  getThemePreference,
  setThemePreference,
  subscribeThemePreference,
  resetThemePreferenceCache,
} from "./theme";
import { RETIRED_DATA_FIELDS, unknownDataFields } from "./schema";

describe("theme preference", () => {
  beforeEach(() => {
    localStorage.clear();
    resetThemePreferenceCache();
  });

  it("defaults to following the system", () => {
    expect(getThemePreference()).toBe("system");
  });

  it("remembers a chosen theme", () => {
    setThemePreference("dark");
    resetThemePreferenceCache();

    expect(getThemePreference()).toBe("dark");
  });

  it("tells subscribers when it changes", () => {
    const seen: string[] = [];
    subscribeThemePreference(theme => seen.push(theme));

    setThemePreference("light");
    setThemePreference("dark");

    expect(seen).toEqual(["light", "dark"]);
  });

  it("says nothing when the theme is set to what it already is", () => {
    setThemePreference("dark");
    const seen: string[] = [];
    subscribeThemePreference(theme => seen.push(theme));

    setThemePreference("dark");

    expect(seen).toEqual([]);
  });

  // The move out of the synced document must not reset anybody's screen.
  it("adopts the theme the synced document used to hold", () => {
    localStorage.setItem("app-data-document", JSON.stringify({ data: { theme: "dark" } }));

    expect(getThemePreference()).toBe("dark");
  });

  it("writes the adopted theme to its own key, so the document is read once", () => {
    localStorage.setItem("app-data-document", JSON.stringify({ data: { theme: "light" } }));
    getThemePreference();

    expect(localStorage.getItem("theme-preference")).toBe("light");
  });

  it("ignores a document holding something that is not a theme", () => {
    localStorage.setItem("app-data-document", JSON.stringify({ data: { theme: "chartreuse" } }));

    expect(getThemePreference()).toBe("system");
  });

  it("survives a document that is not readable at all", () => {
    localStorage.setItem("app-data-document", "{ not json");

    expect(getThemePreference()).toBe("system");
  });

  // Without this an older device would sync `theme` back into the document, and the
  // field would quietly return to the shape it was moved out of.
  it("is retired from the document rather than carried through as unknown", () => {
    expect(RETIRED_DATA_FIELDS.has("theme")).toBe(true);
    expect(unknownDataFields({ theme: "dark", fieldFromTheFuture: 1 })).toEqual({ fieldFromTheFuture: 1 });
  });
});
