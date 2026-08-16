import { describe, it, expect } from "vitest";
import {
  isReviewPreparationWeek,
  isKihonOnlyWeek,
  isRegularWeek,
  isHokeiMoment,
  isStandardMoment,
  getHokeiMoments,
  getStandardMoments,
  getAllHokeiMoments,
  getWeeksWithKihonShoho,
  findGradePlan,
  type HokeiMoment,
  type StandardMoment,
  type RegularWeek,
  type KihonOnlyWeek,
  type ReviewPreparationWeek,
  type GradePlan,
} from "./data";

const hokei: HokeiMoment = {
  id: "ippo",
  type: "hokei_moment",
  hokei_name: "ippo",
  ren_hanko: false,
  variations: [],
  technique_group: "nuki",
  foot_stance: [],
  roles: { attacker: {}, defender: {} },
  kyohan_pages: [],
};

const standard: StandardMoment = {
  type: "standard_moment",
  content: ["randori"],
};

const regularWeek: RegularWeek = {
  week: 1,
  type: "regular_week",
  moments: [hokei, standard],
};

const kihonWeek: KihonOnlyWeek = {
  week: 2,
  type: "kihon_only",
  kihon_shoho: ["strike"],
  moments: [standard],
};

const reviewWeek: ReviewPreparationWeek = {
  week: 3,
  type: "review_preparation_week",
  content: ["review content"],
};

const regularWithKihon: RegularWeek = {
  week: 4,
  type: "regular_week",
  kihon_shoho: ["block"],
  moments: [hokei],
};

describe("type guards", () => {
  describe("isRegularWeek", () => {
    it("returns true for a regular_week", () => expect(isRegularWeek(regularWeek)).toBe(true));
    it("returns false for a kihon_only week", () => expect(isRegularWeek(kihonWeek)).toBe(false));
    it("returns false for a review_preparation_week", () => expect(isRegularWeek(reviewWeek)).toBe(false));
  });

  describe("isKihonOnlyWeek", () => {
    it("returns true for a kihon_only week", () => expect(isKihonOnlyWeek(kihonWeek)).toBe(true));
    it("returns false for a regular_week", () => expect(isKihonOnlyWeek(regularWeek)).toBe(false));
    it("returns false for a review_preparation_week", () => expect(isKihonOnlyWeek(reviewWeek)).toBe(false));
  });

  describe("isReviewPreparationWeek", () => {
    it("returns true for a review_preparation_week", () => expect(isReviewPreparationWeek(reviewWeek)).toBe(true));
    it("returns false for a regular_week", () => expect(isReviewPreparationWeek(regularWeek)).toBe(false));
    it("returns false for a kihon_only week", () => expect(isReviewPreparationWeek(kihonWeek)).toBe(false));
  });

  describe("isHokeiMoment", () => {
    it("returns true for a hokei_moment", () => expect(isHokeiMoment(hokei)).toBe(true));
    it("returns false for a standard_moment", () => expect(isHokeiMoment(standard)).toBe(false));
  });

  describe("isStandardMoment", () => {
    it("returns true for a standard_moment", () => expect(isStandardMoment(standard)).toBe(true));
    it("returns false for a hokei_moment", () => expect(isStandardMoment(hokei)).toBe(false));
  });
});

describe("getHokeiMoments", () => {
  it("returns only hokei moments from a regular week", () => {
    expect(getHokeiMoments(regularWeek)).toEqual([hokei]);
  });

  it("returns empty array for a review_preparation_week", () => {
    expect(getHokeiMoments(reviewWeek)).toEqual([]);
  });

  it("returns empty array when week has no hokei moments", () => {
    expect(getHokeiMoments(kihonWeek)).toEqual([]);
  });

  it("returns multiple hokei moments when present", () => {
    const hokei2: HokeiMoment = { ...hokei, hokei_name: "nipo" };
    const week: RegularWeek = { ...regularWeek, moments: [hokei, standard, hokei2] };
    expect(getHokeiMoments(week)).toEqual([hokei, hokei2]);
  });
});

describe("getStandardMoments", () => {
  it("returns only standard moments from a regular week", () => {
    expect(getStandardMoments(regularWeek)).toEqual([standard]);
  });

  it("returns empty array for a review_preparation_week", () => {
    expect(getStandardMoments(reviewWeek)).toEqual([]);
  });

  it("returns empty array when week has no standard moments", () => {
    const weekWithOnlyHokei: RegularWeek = { ...regularWeek, moments: [hokei] };
    expect(getStandardMoments(weekWithOnlyHokei)).toEqual([]);
  });
});

describe("getAllHokeiMoments", () => {
  it("returns all hokei moments across all weeks in a plan", () => {
    const hokei2: HokeiMoment = { ...hokei, hokei_name: "nipo" };
    const plan: GradePlan = {
      grade: "shodan",
      weeks: [
        regularWeek,
        { ...regularWeek, week: 2, moments: [hokei2] },
        reviewWeek,
      ],
    };
    expect(getAllHokeiMoments(plan)).toEqual([hokei, hokei2]);
  });

  it("returns empty array for a plan with only review weeks", () => {
    const plan: GradePlan = { grade: "shodan", weeks: [reviewWeek] };
    expect(getAllHokeiMoments(plan)).toEqual([]);
  });
});

describe("getWeeksWithKihonShoho", () => {
  it("includes regular weeks that have kihon_shoho", () => {
    const result = getWeeksWithKihonShoho({ grade: "shodan", weeks: [regularWithKihon] });
    expect(result).toContain(regularWithKihon);
  });

  it("includes kihon_only weeks", () => {
    const result = getWeeksWithKihonShoho({ grade: "shodan", weeks: [kihonWeek] });
    expect(result).toContain(kihonWeek);
  });

  it("excludes regular weeks without kihon_shoho", () => {
    const result = getWeeksWithKihonShoho({ grade: "shodan", weeks: [regularWeek] });
    expect(result).not.toContain(regularWeek);
  });

  it("excludes review_preparation_weeks", () => {
    const result = getWeeksWithKihonShoho({ grade: "shodan", weeks: [reviewWeek] });
    expect(result).not.toContain(reviewWeek);
  });

  it("returns both types when both are present", () => {
    const result = getWeeksWithKihonShoho({ grade: "shodan", weeks: [regularWithKihon, kihonWeek, reviewWeek] });
    expect(result).toHaveLength(2);
  });
});

describe("findGradePlan", () => {
  const shodan: GradePlan = { grade: "shodan", weeks: [] };
  const nidan: GradePlan = { grade: "nidan", weeks: [] };
  const plans = [shodan, nidan];

  it("returns the plan for the grade asked for", () => {
    expect(findGradePlan(plans, "nidan")).toBe(nidan);
  });

  // A grade can be renamed or dropped from the kamokuhyō, and a device that has been
  // offline can sync an old one back long afterwards. Asserting the lookup succeeded
  // crashed the whole app at render rather than degrading one page.
  it("falls back instead of returning nothing for a grade this build does not ship", () => {
    expect(findGradePlan(plans, "kudan")).toBe(shodan);
  });

  it("leaves the stored grade alone — rendering something usable is not the same as rewriting a profile", () => {
    const asked = "kudan" as const;
    findGradePlan(plans, asked);
    expect(plans.map(p => p.grade)).toEqual(["shodan", "nidan"]);
  });
});
