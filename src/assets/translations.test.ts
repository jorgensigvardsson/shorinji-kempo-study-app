import { describe, it, expect } from "vitest";
import translations from "./translations.json";

// The i18n system normalises lookup keys to lowercase before storing them,
// so "Vecka" and "vecka" are the same effective key at runtime.
// This test mirrors that normalization so we catch genuine gaps, not case differences.
const normalizedKeySet = (obj: Record<string, string>) =>
  new Set(Object.keys(obj).map(k => k.toLowerCase()));

const sections = ["ja", "en", "tr"] as const;

describe("translations.json completeness", () => {
  const keysBySection = Object.fromEntries(
    sections.map(lang => [lang, normalizedKeySet(translations[lang])])
  ) as Record<typeof sections[number], Set<string>>;

  for (const source of sections) {
    for (const target of sections) {
      if (source === target) continue;

      it(`every key in "${source}" also exists in "${target}"`, () => {
        const missing = [...keysBySection[source]].filter(k => !keysBySection[target].has(k));
        expect(
          missing,
          `${missing.length} key(s) in "${source}" missing from "${target}": ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`
        ).toHaveLength(0);
      });
    }
  }
});
