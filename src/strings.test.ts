import { describe, expect, it } from "vitest";
import { matchesString, normalizeString, gradeLabel } from "./strings";
import { TranslatorImplementation } from "./i18n";

describe("normalizeString", () => {
  it("converts ō (U+014D) to o", () => expect(normalizeString("ō")).toBe("o"));
  it("converts ū (U+016B) to u", () => expect(normalizeString("ū")).toBe("u"));
  it("lowercases ASCII A–Z", () => expect(normalizeString("ABC")).toBe("abc"));
  it("leaves lowercase ASCII unchanged", () => expect(normalizeString("xyz")).toBe("xyz"));
  it("handles mixed normalization in one string", () => expect(normalizeString("Jōdan")).toBe("jodan"));
  it("returns empty string unchanged", () => expect(normalizeString("")).toBe(""));
});

describe("matchesString", () => {
  it("always matches an empty needle", () => expect(matchesString("anything", "")).toBe(true));
  it("returns false when needle is longer than haystack", () => expect(matchesString("hi", "hello")).toBe(false));
  it("matches the full string exactly", () => expect(matchesString("hello", "hello")).toBe(true));
  it("matches a prefix", () => expect(matchesString("hello world", "hello")).toBe(true));
  it("matches a suffix", () => expect(matchesString("hello world", "world")).toBe(true));
  it("matches a substring in the middle", () => expect(matchesString("hello world", "lo wo")).toBe(true));
  it("is case-insensitive for ASCII", () => expect(matchesString("Hello World", "hello")).toBe(true));
  it("normalizes ō to o when searching", () => expect(matchesString("Jōdan", "jodan")).toBe(true));
  it("normalizes ū to u when searching", () => expect(matchesString("Tsūki", "tsuki")).toBe(true));
  it("returns false when substring is absent", () => expect(matchesString("hello", "world")).toBe(false));
  it("returns false for empty haystack with non-empty needle", () => expect(matchesString("", "x")).toBe(false));
});

describe("gradeLabel", () => {
  it("includes parentheses (Japanese form) for non-Japanese language", () => {
    const translator = new TranslatorImplementation({}, "en");
    expect(gradeLabel("shodan", translator)).toContain("(");
  });

  it("does not include parentheses for Japanese language", () => {
    const translator = new TranslatorImplementation({}, "ja");
    expect(gradeLabel("shodan", translator)).not.toContain("(");
  });

  it("capitalizes the translated name for non-Japanese", () => {
    const translator = new TranslatorImplementation({}, "en");
    const label = gradeLabel("shodan", translator);
    expect(label[0]).toBe(label[0].toUpperCase());
  });
});
