import { describe, expect, it } from "vitest";
import { hokeiReferenceLabel, localizeSourceTerm, standardMomentLabel, weekIntroduction } from "./weekly-copy";
import type { GodanWeek, HokeiMoment, KyushoZemeWeek, RegularWeek, ReviewPreparationWeek, StandardMoment, YondanWeek } from "./data";
import type { Language, Translator } from "./i18n";

// A translator that hands back what it was given, so the tests read the structure of
// the copy rather than the contents of translations.json. Capitalization and parameter
// substitution are reproduced because the copy depends on both.
function makeTranslator(language: Language = "sv", table: Record<string, string> = {}): Translator {
  const lookup = (text: string | number) => table[String(text)] ?? String(text);
  return {
    get currentLanguage() { return language; },
    get isJapanese() { return language === "ja"; },
    translate(text, options) {
      let result = lookup(text);
      if (options?.params) result = result.replace(/\{(\d+)\}/g, (_, i) => options.params![Number(i)] ?? `{${i}}`);
      if (options?.capitalize && language !== "ja") result = result.charAt(0).toUpperCase() + result.slice(1);
      return result;
    },
    explicitTranslate(_language, text) { return lookup(text); },
    japanese(text) { return `ja:${String(text)}`; },
  };
}

const hokeiMoment = (name: string): HokeiMoment => ({
  type: "hokei_moment",
  hokei_name: name,
  ren_hanko: false,
  variations: [],
  technique_group: "",
  foot_stance: [],
  roles: {} as HokeiMoment["roles"],
  kyohan_pages: [],
});

const standardMoment = (moment: Partial<StandardMoment> & { content: string[] }): StandardMoment => ({
  type: "standard_moment",
  ...moment,
});

const regularWeek = (week: Partial<RegularWeek> = {}): RegularWeek => ({
  week: 1,
  type: "regular_week",
  moments: [],
  ...week,
});

describe("localizeSourceTerm", () => {
  it("translates when the app is not in Japanese", () => {
    expect(localizeSourceTerm("ukemi", makeTranslator("sv", { ukemi: "fallteknik" }), false)).toBe("fallteknik");
  });

  it("goes to the Japanese lookup instead when it is", () => {
    expect(localizeSourceTerm("ukemi", makeTranslator("ja"), true)).toBe("ja:ukemi");
  });

  it("capitalizes only when asked, and never for Japanese", () => {
    expect(localizeSourceTerm("ukemi", makeTranslator("sv"), false, true)).toBe("Ukemi");
    expect(localizeSourceTerm("ukemi", makeTranslator("sv"), false)).toBe("ukemi");
    expect(localizeSourceTerm("ukemi", makeTranslator("ja"), true, true)).toBe("ja:ukemi");
  });
});

describe("hokeiReferenceLabel", () => {
  it("is just the name when there are no variants", () => {
    expect(hokeiReferenceLabel({ hokei_ref: "kote nage", variants: [] }, makeTranslator(), false))
      .toBe("Kote nage");
  });

  it("lists variants in parentheses", () => {
    expect(hokeiReferenceLabel({ hokei_ref: "kote nage", variants: ["katate", "morote"] }, makeTranslator(), false))
      .toBe("Kote nage (katate och morote)");
  });

  it("does not capitalize in Japanese", () => {
    expect(hokeiReferenceLabel({ hokei_ref: "kote nage", variants: [] }, makeTranslator("ja"), true))
      .toBe("ja:kote nage");
  });
});

describe("standardMomentLabel", () => {
  it("joins several contents", () => {
    expect(standardMomentLabel(standardMoment({ content: ["embu", "kihon"] }), makeTranslator(), false))
      .toBe("Embu · Kihon");
  });

  // Randori is the one content that is not simply a translated term: it picks up the
  // moment's own type and restriction.
  it("spells out randori with its type and restriction", () => {
    const moment = standardMoment({ content: ["randori"], randori: "tandoku", restrictions: "endast zuki" });
    expect(standardMomentLabel(moment, makeTranslator(), false)).toBe("Randori · tandoku — endast zuki");
  });

  it("leaves out the parts a moment does not have", () => {
    expect(standardMomentLabel(standardMoment({ content: ["randori"] }), makeTranslator(), false)).toBe("Randori");
    expect(standardMomentLabel(standardMoment({ content: ["randori"], randori: "tandoku" }), makeTranslator(), false))
      .toBe("Randori · tandoku");
    expect(standardMomentLabel(standardMoment({ content: ["randori"], restrictions: "endast zuki" }), makeTranslator(), false))
      .toBe("Randori — endast zuki");
  });
});

describe("weekIntroduction", () => {
  it("describes a review-preparation week by its content", () => {
    const week: ReviewPreparationWeek = { week: 12, type: "review_preparation_week", content: ["hokei", "randori"] };
    expect(weekIntroduction(week, makeTranslator()))
      .toBe("En vecka för att samla ihop det du arbetat med: hokei och randori.");
  });

  it("describes a yondan week with and without a moment", () => {
    const study = [{ hokei_ref: "kote nage", variants: [] }];
    const withMoment: YondanWeek = {
      week: 3, type: "yondan_week", study_teach: study,
      moment: { type: "yondan_hokei_moment", hokei_name: "gyaku gote", variations: [], technique_group: "", kyohan_pages: [] },
    };
    expect(weekIntroduction(withMoment, makeTranslator()))
      .toBe("Veckan förenar studier och undervisning av Kote nage med Gyaku gote.");

    const withoutMoment: YondanWeek = { week: 3, type: "yondan_week", study_teach: study };
    expect(weekIntroduction(withoutMoment, makeTranslator()))
      .toBe("Veckan ägnas åt att studera och undervisa Kote nage.");
  });

  it("describes a godan week by its moment", () => {
    const week: GodanWeek = {
      week: 4, type: "godan_week",
      moment: { type: "godan_hokei_moment", hokei_name: "kote nage", variations: [], kyohan_pages: [] },
    };
    expect(weekIntroduction(week, makeTranslator())).toBe("Den här veckan får Kote nage stå i centrum.");
  });

  it("describes a kyūsho zeme week by its zeme", () => {
    const week: KyushoZemeWeek = {
      week: 5, type: "kyusho_zeme_week",
      zeme: { type: "kyusho_zeme", name: "kasumi", kyohan_pages: [] },
    };
    expect(weekIntroduction(week, makeTranslator())).toBe("Den här veckan får arbetet med Kasumi stå i centrum.");
  });

  describe("a regular week", () => {
    it("falls back to a general sentence when there is nothing to say", () => {
      expect(weekIntroduction(regularWeek(), makeTranslator()))
        .toBe("Veckans innehåll följer planen för din grad.");
    });

    it("names the hokei at its centre", () => {
      const week = regularWeek({ moments: [hokeiMoment("kote nage"), hokeiMoment("gyaku gote")] });
      expect(weekIntroduction(week, makeTranslator())).toBe("Kote nage och Gyaku gote står i centrum.");
    });

    it("describes recurring standard moments once each", () => {
      const week = regularWeek({
        moments: [
          standardMoment({ content: ["embu"] }),
          standardMoment({ content: ["embu"] }), // the same thing twice is still one description
          standardMoment({ content: ["randori"], randori: "tandoku", restrictions: "endast zuki" }),
        ],
      });
      expect(weekIntroduction(week, makeTranslator()))
        .toBe("Embu och Randori i tandoku med fokus på endast zuki återkommer genom veckan.");
    });

    it("combines basic work, hokei and recurring parts into one paragraph", () => {
      const week = regularWeek({
        kihon_shoho: ["ukemi", "zenshin ashi"],
        moments: [hokeiMoment("kote nage"), standardMoment({ content: ["embu"] })],
      });
      expect(weekIntroduction(week, makeTranslator())).toBe(
        "Veckans grundarbete rör sig kring förflyttning och tai sabaki och ukemi."
        + " Kote nage står i centrum."
        + " Embu återkommer genom veckan.",
      );
    });

    // "ukemi" contains "uke", which used to match the strikes-and-blocks rule as well
    // and told three real weeks their basic work involved strikes when it was only
    // falling. The rule bounds `uke` as a word now.
    it("does not read ukemi as a block", () => {
      const week = regularWeek({ kihon_shoho: ["varierande ukemi"] });
      expect(weekIntroduction(week, makeTranslator())).toBe("Veckans grundarbete rör sig kring ukemi.");
    });

    it("still reads a real block as one", () => {
      const week = regularWeek({ kihon_shoho: ["uchi uke zuki"] });
      expect(weekIntroduction(week, makeTranslator()))
        .toBe("Veckans grundarbete rör sig kring slag, sparkar och uke.");
    });

    // kihon_shoho holds either free text or a hokei reference; only the text entries
    // feed the basic-focus sentence.
    it("ignores hokei references among the basic entries", () => {
      const week = regularWeek({ kihon_shoho: [{ hokei_ref: "kote nage", variants: [] }] });
      expect(weekIntroduction(week, makeTranslator())).toBe("Veckans innehåll följer planen för din grad.");
    });

    it("falls back to kihon shohō when no basic rule matches", () => {
      const week = regularWeek({ kihon_shoho: ["något helt annat"] });
      expect(weekIntroduction(week, makeTranslator())).toBe("Veckans grundarbete rör sig kring kihon shohō.");
    });

    it("names at most four areas of basic work", () => {
      const week = regularWeek({
        kihon_shoho: ["reishiki", "ashi", "ukemi", "kōbō", "kyūsho", "zuki"],
      });
      const introduction = weekIntroduction(week, makeTranslator());
      // Five rules match; the sentence keeps four so it stays readable.
      expect(introduction).toBe(
        "Veckans grundarbete rör sig kring reishiki och shosahō, förflyttning och tai sabaki, ukemi och kōbōgi.",
      );
    });
  });

  it("joins lists the way the reader's language does", () => {
    const week = regularWeek({ moments: [hokeiMoment("a"), hokeiMoment("b")] });
    expect(weekIntroduction(week, makeTranslator("sv"))).toContain("A och B");
    expect(weekIntroduction(week, makeTranslator("en"))).toContain("A and B");
  });
});
