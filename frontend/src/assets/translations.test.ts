import { describe, it, expect } from "vitest";
import ja from "./translations.ja.json";
import en from "./translations.en.json";
import tr from "./translations.tr.json";
// As text, because the parsed form is exactly where a duplicate key disappears.
import jaText from "./translations.ja.json?raw";
import enText from "./translations.en.json?raw";
import trText from "./translations.tr.json?raw";

const sections: Record<"ja" | "en" | "tr", Record<string, string>> = { ja, en, tr };
const sourceText: Record<"ja" | "en" | "tr", string> = { ja: jaText, en: enText, tr: trText };

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
describe("translation files, duplicate keys", () => {
  for (const language of ["ja", "en", "tr"] as const) {
    it(`declares each key once in ${language}`, () => {
      const seen = new Set<string>();
      const duplicates: string[] = [];

      for (const line of sourceText[language].split(/\r?\n/)) {
        const entry = /^ {2}("(?:[^"\\]|\\.)*")\s*:/.exec(line);
        if (!entry) continue;
        if (seen.has(entry[1])) duplicates.push(entry[1]);
        seen.add(entry[1]);
      }

      expect(duplicates, `duplicated: ${duplicates.join(", ")}`).toHaveLength(0);
    });

    // The split into one file per language is only safe while each file really is
    // just that language's section. A file that grew a nested object would silently
    // stop being a translation table.
    it(`holds only string values in ${language}`, () => {
      const wrong = Object.entries(sections[language])
        .filter(([, value]) => typeof value !== "string")
        .map(([key]) => key);
      expect(wrong, `non-string values: ${wrong.join(", ")}`).toHaveLength(0);
    });
  }
});

describe("translation files, completeness", () => {
  const keysBySection = Object.fromEntries(
    ["ja", "en", "tr"].map(lang => [lang, normalizedKeySet(sections[lang as keyof typeof sections])])
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
