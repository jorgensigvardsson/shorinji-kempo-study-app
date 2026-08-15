import { describe, it, expect } from "vitest";
import translations from "./translations.json";
// As text, because the parsed form is exactly where a duplicate key disappears.
import translationsText from "./translations.json?raw";

// The i18n system normalises lookup keys to lowercase before storing them,
// so "Vecka" and "vecka" are the same effective key at runtime.
// This test mirrors that normalization so we catch genuine gaps, not case differences.
const normalizedKeySet = (obj: Record<string, string>) =>
  new Set(Object.keys(obj).map(k => k.toLowerCase()));

// "ja" is a curated set of real translations — it is intentionally a subset of
// "en"/"tr" and is not required to mirror them fully. "en" and "tr" must be
// symmetric with each other, and anything translated into "ja" must also have
// coverage in "en" and "tr".
const mustBeSubsetOf: Array<[string, string]> = [
  ["ja", "en"],
  ["ja", "tr"],
  ["en", "tr"],
  ["tr", "en"],
];

// A duplicated key is invisible once parsed: every JSON parser keeps one of them, so
// the file reads as if two translations were in effect while only ever one was. Two
// keys were duplicated this way for a long time without anything noticing.
describe("translations.json duplicate keys", () => {
  it("declares each key once per language section", () => {
    let section: string | null = null;
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const line of translationsText.split(/\r?\n/)) {
      const start = /^ {2}"(ja|en|tr)": \{/.exec(line);
      if (start) {
        section = start[1];
        continue;
      }
      if (!section) continue;
      const entry = /^ {4}("(?:[^"\\]|\\.)*")\s*:/.exec(line);
      if (!entry) continue;
      const id = `${section} ${entry[1]}`;
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }

    expect(duplicates, `duplicated: ${duplicates.join(", ")}`).toHaveLength(0);
  });
});

describe("translations.json completeness", () => {
  const keysBySection = Object.fromEntries(
    ["ja", "en", "tr"].map(lang => [lang, normalizedKeySet(translations[lang as keyof typeof translations])])
  ) as Record<"ja" | "en" | "tr", Set<string>>;

  for (const [source, target] of mustBeSubsetOf) {
    it(`every key in "${source}" also exists in "${target}"`, () => {
      const missing = [...keysBySection[source as "ja" | "en" | "tr"]].filter(k => !keysBySection[target as "ja" | "en" | "tr"].has(k));
      expect(
        missing,
        `${missing.length} key(s) in "${source}" missing from "${target}": ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`
      ).toHaveLength(0);
    });
  }
});
