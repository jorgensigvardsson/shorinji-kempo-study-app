import { describe, it, expect } from "vitest";
import { i18n, numberToKanji, noTranslate, TranslatorImplementation } from "./i18n";
import type { Translations } from "./i18n";

const translations: Translations = {
  en: {
    "hello": "Hello",
    "goodbye": "Goodbye",
    "welcome {0}": "Welcome {0}",
    "item count: {0} of {1}": "Item count: {0} of {1}",
  },
  tr: {
    "hello": "Merhaba",
  },
  ja: {
    "hello": "こんにちは",
  },
};

describe("i18n — language fallback", () => {
  it("returns original text for Swedish (fallback language not in translations)", () => {
    expect(i18n(translations, "sv", "hello")).toBe("hello");
  });

  it("returns original text when key has no translation in the given language", () => {
    expect(i18n(translations, "en", "unknown key")).toBe("unknown key");
  });
});

describe("i18n — basic translation", () => {
  it("translates a known English key", () => {
    expect(i18n(translations, "en", "hello")).toBe("Hello");
  });

  it("translates a known Turkish key", () => {
    expect(i18n(translations, "tr", "hello")).toBe("Merhaba");
  });

  it("translates a known Japanese key", () => {
    expect(i18n(translations, "ja", "hello")).toBe("こんにちは");
  });

  it("lookup is case-insensitive (uppercase input matches lowercase key)", () => {
    expect(i18n(translations, "en", "HELLO")).toBe("Hello");
  });
});

describe("i18n — number input", () => {
  it("converts integers to Kanji for Japanese", () => {
    expect(i18n(translations, "ja", 3)).toBe("三");
  });

  it("returns the string form of a number for non-Japanese", () => {
    expect(i18n(translations, "en", 42)).toBe("42");
  });

  it("returns the string form for Swedish numbers", () => {
    expect(i18n(translations, "sv", 7)).toBe("7");
  });

  it("does not apply Kanji conversion for negative numbers in Japanese", () => {
    expect(i18n(translations, "ja", -1)).toBe("-1");
  });

  it("does not apply Kanji conversion for non-integers in Japanese", () => {
    expect(i18n(translations, "ja", 1.5)).toBe("1.5");
  });
});

describe("i18n — params substitution", () => {
  it("substitutes a single parameter", () => {
    expect(i18n(translations, "en", "welcome {0}", { params: ["Alice"] })).toBe("Welcome Alice");
  });

  it("substitutes multiple parameters", () => {
    expect(i18n(translations, "en", "item count: {0} of {1}", { params: ["3", "10"] })).toBe("Item count: 3 of 10");
  });

  it("leaves unmatched placeholders when param is missing", () => {
    expect(i18n(translations, "en", "item count: {0} of {1}", { params: ["5"] })).toBe("Item count: 5 of {1}");
  });

  it("applies params on untranslated Swedish text", () => {
    expect(i18n({ sv: {} }, "sv", "page {0}", { params: ["2"] })).toBe("page 2");
  });
});

describe("i18n — capitalize option", () => {
  it("capitalizes the first letter of a translated string", () => {
    const t: Translations = { en: { "hello world": "hello world" } };
    expect(i18n(t, "en", "hello world", { capitalize: true })).toBe("Hello world");
  });

  it("does not capitalize for Japanese", () => {
    const t: Translations = { ja: { "test": "テスト" } };
    expect(i18n(t, "ja", "test", { capitalize: true })).toBe("テスト");
  });

  it("capitalize works on untranslated Swedish text", () => {
    expect(i18n(translations, "sv", "hello", { capitalize: true })).toBe("Hello");
  });
});

describe("i18n — caching", () => {
  it("returns the same result on repeated calls (cache is consistent)", () => {
    const result1 = i18n(translations, "en", "hello");
    const result2 = i18n(translations, "en", "hello");
    expect(result1).toBe(result2);
  });
});

describe("noTranslate", () => {
  it("returns the string unchanged", () => {
    expect(noTranslate("some fixed string")).toBe("some fixed string");
  });

  it("is an identity function", () => {
    const input = "東京";
    expect(noTranslate(input)).toBe(input);
  });
});

describe("TranslatorImplementation", () => {
  it("translate delegates to i18n with the current language", () => {
    const t = new TranslatorImplementation(translations, "en");
    expect(t.translate("hello")).toBe("Hello");
  });

  it("explicitTranslate uses the specified language", () => {
    const t = new TranslatorImplementation(translations, "en");
    expect(t.explicitTranslate("tr", "hello")).toBe("Merhaba");
  });

  it("isJapanese is true when currentLanguage is ja", () => {
    expect(new TranslatorImplementation(translations, "ja").isJapanese).toBe(true);
  });

  it("isJapanese is false for non-Japanese languages", () => {
    expect(new TranslatorImplementation(translations, "en").isJapanese).toBe(false);
  });
});

describe("numberToKanji", () => {
  it("converts 0 to 零", () => expect(numberToKanji(0)).toBe("零"));
  it("converts 1 to 一", () => expect(numberToKanji(1)).toBe("一"));
  it("converts 9 to 九", () => expect(numberToKanji(9)).toBe("九"));

  it("converts 10 to 十 (no leading 一)", () => expect(numberToKanji(10)).toBe("十"));
  it("converts 11 to 十一", () => expect(numberToKanji(11)).toBe("十一"));
  it("converts 20 to 二十", () => expect(numberToKanji(20)).toBe("二十"));
  it("converts 99 to 九十九", () => expect(numberToKanji(99)).toBe("九十九"));

  it("converts 100 to 百 (no leading 一)", () => expect(numberToKanji(100)).toBe("百"));
  it("converts 110 to 百十", () => expect(numberToKanji(110)).toBe("百十"));
  it("converts 111 to 百十一", () => expect(numberToKanji(111)).toBe("百十一"));

  it("converts 1000 to 千 (no leading 一)", () => expect(numberToKanji(1000)).toBe("千"));
  it("converts 1001 to 千一", () => expect(numberToKanji(1001)).toBe("千一"));

  it("converts 10000 to 一万", () => expect(numberToKanji(10000)).toBe("一万"));
  it("converts 11000 to 一万千", () => expect(numberToKanji(11000)).toBe("一万千"));
  it("converts 100000000 to 一億", () => expect(numberToKanji(100000000)).toBe("一億"));

  it("throws for negative input", () => {
    expect(() => numberToKanji(-1)).toThrow();
  });

  it("throws for non-integer input", () => {
    expect(() => numberToKanji(1.5)).toThrow();
  });
});
