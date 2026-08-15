import { beforeEach, describe, expect, it } from "vitest";
import { TranslatorImplementation } from "./i18n";
import { getMissingWordLookups, logMissingWordLookup } from "./missing-word-lookups";
import { findLookupTextAtOffset, lookupWordEntries } from "./word-lookup";
import { isUsefulLookupSelection } from "./lookup-text";

const translator = new TranslatorImplementation({}, "sv");

beforeEach(() => {
  localStorage.clear();
});

describe("word lookup", () => {
  it("finds slash aliases such as geri", () => {
    const results = lookupWordEntries("geri", translator);
    expect(results.some(entry => entry.romaji === "keri/geri")).toBe(true);
  });

  it("splits a compound term into existing dictionary words", () => {
    const results = lookupWordEntries("gyaku gote", translator);
    expect(results.map(entry => entry.romaji)).toEqual(expect.arrayContaining(["gyaku", "gote"]));
  });

  it("rejects long selections that are likely sentences", () => {
    expect(isUsefulLookupSelection("ett två tre fyra fem sex sju åtta nio")).toBe(false);
  });

  it("prefers a complete dictionary phrase around the pressed word", () => {
    expect(findLookupTextAtOffset("Öva gasshō rei lugnt", 12, translator)?.text).toBe("gasshō rei");
  });

  it("returns a single pressed word when there is no complete dictionary phrase", () => {
    expect(findLookupTextAtOffset("Träna gyaku gote", 8, translator)?.text).toBe("gyaku");
  });
});

describe("missing word lookup log", () => {
  it("stores only the selected term and counts repeated lookups", () => {
    logMissingWordLookup("saknat-testord");
    logMissingWordLookup("saknat-testord");

    const [entry] = getMissingWordLookups();
    expect(entry.term).toBe("saknat-testord");
    expect(entry.count).toBe(2);
  });
});
