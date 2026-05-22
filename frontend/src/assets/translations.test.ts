import { describe, it, expect } from "vitest";
import translations from "./translations.json";

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
