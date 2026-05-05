import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildWordListCandidates,
  buildKamokuCandidates,
  buildQuizPool,
  drawQuestion,
  pickDistractors,
  dedupeCandidates,
  normalizeText,
  normalizeKey,
  containsNormalized,
  shuffle,
  type QuizPool,
  type QuizCandidate,
} from "./quiz-logic";
import type { WordListEntry, GradePlan, HokeiMoment } from "./data";

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── normalizeText ────────────────────────────────────────────────────────────

describe("normalizeText", () => {
  it("returns empty string for undefined", () => expect(normalizeText(undefined)).toBe(""));
  it("returns empty string for empty string", () => expect(normalizeText("")).toBe(""));
  it("trims leading and trailing whitespace", () => expect(normalizeText("  hello  ")).toBe("hello"));
  it("collapses internal whitespace to a single space", () => expect(normalizeText("a  b   c")).toBe("a b c"));
});

describe("normalizeKey", () => {
  it("lowercases the result", () => expect(normalizeKey("Hello World")).toBe("hello world"));
  it("also trims whitespace", () => expect(normalizeKey("  Foo  ")).toBe("foo"));
});

describe("containsNormalized", () => {
  it("finds a value ignoring case", () => expect(containsNormalized(["Nuki"], "nuki")).toBe(true));
  it("returns false when value is absent", () => expect(containsNormalized(["uchi"], "nuki")).toBe(false));
  it("handles empty array", () => expect(containsNormalized([], "nuki")).toBe(false));
});

// ─── shuffle ─────────────────────────────────────────────────────────────────

describe("shuffle", () => {
  it("returns the same elements in some order", () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result).toHaveLength(input.length);
    expect(result.sort()).toEqual([...input].sort());
  });

  it("does not mutate the original array", () => {
    const input = [1, 2, 3];
    shuffle(input);
    expect(input).toEqual([1, 2, 3]);
  });

  it("returns a new array instance", () => {
    const input = [1, 2];
    expect(shuffle(input)).not.toBe(input);
  });
});

// ─── dedupeCandidates ────────────────────────────────────────────────────────

describe("dedupeCandidates", () => {
  const base: QuizCandidate = {
    id: "a",
    question: "Q?",
    questionArgs: [],
    correctAnswer: "Answer",
    domain: "d",
  };

  it("keeps unique candidates", () => {
    const b = { ...base, id: "b", correctAnswer: "Other" };
    expect(dedupeCandidates([base, b])).toHaveLength(2);
  });

  it("removes duplicates with same domain+question+answer (case-insensitive)", () => {
    const dup = { ...base, id: "b", correctAnswer: "answer" };
    expect(dedupeCandidates([base, dup])).toHaveLength(1);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupeCandidates([])).toEqual([]);
  });
});

// ─── pickDistractors ─────────────────────────────────────────────────────────

describe("pickDistractors", () => {
  const domain = ["alpha", "beta", "gamma", "delta"];

  it("never includes the correct answer", () => {
    const result = pickDistractors(domain, "alpha", 3);
    expect(result).not.toContain("alpha");
  });

  it("returns at most `count` items", () => {
    expect(pickDistractors(domain, "alpha", 2)).toHaveLength(2);
  });

  it("returns fewer than count when not enough distractors exist", () => {
    expect(pickDistractors(["only", "correct"], "correct", 2)).toHaveLength(1);
  });

  it("returns empty array when all domain values equal the correct answer", () => {
    expect(pickDistractors(["same"], "same", 2)).toHaveLength(0);
  });
});

// ─── buildWordListCandidates ──────────────────────────────────────────────────

describe("buildWordListCandidates", () => {
  const entry: WordListEntry = {
    index: 1,
    romaji: "ippo",
    meanings: ["one step"],
  };

  it("produces a meaning-question candidate", () => {
    const result = buildWordListCandidates([entry]);
    expect(result.some(c => c.domain === "word.meaning" && c.correctAnswer === "one step")).toBe(true);
  });

  it("produces a romaji-from-meaning candidate", () => {
    const result = buildWordListCandidates([entry]);
    expect(result.some(c => c.domain === "word.romaji" && c.correctAnswer === "ippo")).toBe(true);
  });

  it("produces a romaji-from-kanji candidate when kanji is present", () => {
    const withKanji = { ...entry, kanji: "一歩" };
    const result = buildWordListCandidates([withKanji]);
    const kanjiQ = result.find(c => c.id.startsWith("word.romaji_from_kanji"));
    expect(kanjiQ).toBeDefined();
    expect(kanjiQ?.correctAnswer).toBe("ippo");
  });

  it("skips entries without romaji", () => {
    const noRomaji: WordListEntry = { index: 2, meanings: ["something"] };
    expect(buildWordListCandidates([noRomaji])).toHaveLength(0);
  });

  it("skips entries without meanings", () => {
    const noMeaning: WordListEntry = { index: 3, romaji: "nuki" };
    expect(buildWordListCandidates([noMeaning])).toHaveLength(0);
  });

  it("deduplicates candidates with identical domain+question+answer", () => {
    const dup: WordListEntry = { index: 99, romaji: "ippo", meanings: ["one step"] };
    const result = buildWordListCandidates([entry, dup]);
    const meaningCandidates = result.filter(c => c.domain === "word.meaning");
    expect(meaningCandidates).toHaveLength(1);
  });

  it("normalises extra whitespace in romaji and meanings", () => {
    const messy: WordListEntry = { index: 5, romaji: "  ippo  ", meanings: ["  one step  "] };
    const result = buildWordListCandidates([messy]);
    expect(result.find(c => c.domain === "word.meaning")?.correctAnswer).toBe("one step");
  });
});

// ─── buildKamokuCandidates ───────────────────────────────────────────────────

const baseHokei: HokeiMoment = {
  type: "hokei_moment",
  hokei_name: "morote tsuki",
  ren_hanko: false,
  variations: [],
  technique_group: "tsuki",
  foot_stance: [],
  roles: {
    attacker: { stance: "migi zuki", action: "tsuki" },
    defender: { stance: "hidari uke", action: "uke" },
  },
  kyohan_pages: [],
};

const shodanPlan: GradePlan = {
  grade: "shodan",
  weeks: [{ week: 1, type: "regular_week", moments: [baseHokei] }],
};

const nidanPlan: GradePlan = {
  grade: "nidan",
  weeks: [{ week: 1, type: "regular_week", moments: [baseHokei] }],
};

describe("buildKamokuCandidates", () => {
  it("excludes plans for grades above myGrade", () => {
    const result = buildKamokuCandidates([nidanPlan], "shodan");
    expect(result).toHaveLength(0);
  });

  it("includes plans for grades at or below myGrade", () => {
    const result = buildKamokuCandidates([shodanPlan], "shodan");
    expect(result.length).toBeGreaterThan(0);
  });

  it("generates a technique-group question", () => {
    const result = buildKamokuCandidates([shodanPlan], "shodan");
    expect(result.some(c => c.domain === "kamoku.technique_group" && c.correctAnswer === "tsuki")).toBe(true);
  });

  it("generates attacker-stance and attacker-action questions", () => {
    const result = buildKamokuCandidates([shodanPlan], "shodan");
    expect(result.some(c => c.domain === "kamoku.attacker_stance")).toBe(true);
    expect(result.some(c => c.domain === "kamoku.attacker_action")).toBe(true);
  });

  it("generates defender-stance and defender-action questions", () => {
    const result = buildKamokuCandidates([shodanPlan], "shodan");
    expect(result.some(c => c.domain === "kamoku.defender_stance")).toBe(true);
    expect(result.some(c => c.domain === "kamoku.defender_action")).toBe(true);
  });

  it("skips review_preparation_weeks (no hokei moments)", () => {
    const plan: GradePlan = {
      grade: "shodan",
      weeks: [{ week: 1, type: "review_preparation_week", content: [] }],
    };
    expect(buildKamokuCandidates([plan], "shodan")).toHaveLength(0);
  });

  it("skips hokei without a name", () => {
    const noName: HokeiMoment = { ...baseHokei, hokei_name: "" };
    const plan: GradePlan = {
      grade: "shodan",
      weeks: [{ week: 1, type: "regular_week", moments: [noName] }],
    };
    expect(buildKamokuCandidates([plan], "shodan")).toHaveLength(0);
  });
});

// ─── buildQuizPool ────────────────────────────────────────────────────────────

describe("buildQuizPool", () => {
  const wordEntries: WordListEntry[] = [
    { index: 1, romaji: "alpha", meanings: ["a"] },
    { index: 2, romaji: "beta", meanings: ["b"] },
    { index: 3, romaji: "gamma", meanings: ["c"] },
  ];

  it("filters out candidates whose domain has fewer than 3 options", () => {
    // single entry → only 1 domain value → not viable
    const pool = buildQuizPool("shodan", [{ index: 1, romaji: "alpha", meanings: ["a"] }], []);
    expect(pool.candidates).toHaveLength(0);
  });

  it("keeps candidates when the domain has at least 3 options", () => {
    const pool = buildQuizPool("shodan", wordEntries, []);
    expect(pool.candidates.length).toBeGreaterThan(0);
  });

  it("builds domainOptions map with deduplicated answers", () => {
    const pool = buildQuizPool("shodan", wordEntries, []);
    for (const [, values] of pool.domainOptions) {
      const lower = values.map(v => v.toLowerCase());
      expect(new Set(lower).size).toBe(lower.length);
    }
  });
});

// ─── drawQuestion ─────────────────────────────────────────────────────────────

function makePool(candidates: QuizCandidate[]): QuizPool {
  const domainOptions = new Map<string, string[]>();
  for (const c of candidates) {
    const vals = domainOptions.get(c.domain) ?? [];
    if (!vals.includes(c.correctAnswer)) vals.push(c.correctAnswer);
    domainOptions.set(c.domain, vals);
  }
  return { candidates, domainOptions };
}

describe("drawQuestion", () => {
  it("returns null for an empty pool", () => {
    expect(drawQuestion(makePool([]))).toBeNull();
  });

  it("returns null when the domain has fewer than 2 distractors", () => {
    const candidate: QuizCandidate = {
      id: "q1", question: "Q?", questionArgs: [], correctAnswer: "right", domain: "d",
    };
    // domainOptions only has the correct answer → 0 distractors
    const pool: QuizPool = { candidates: [candidate], domainOptions: new Map([["d", ["right"]]]) };
    expect(drawQuestion(pool)).toBeNull();
  });

  it("returns a question with exactly 3 alternatives", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const candidates: QuizCandidate[] = [
      { id: "q1", question: "Q?", questionArgs: [], correctAnswer: "right", domain: "d" },
    ];
    const pool: QuizPool = {
      candidates,
      domainOptions: new Map([["d", ["right", "wrong1", "wrong2"]]]),
    };
    const q = drawQuestion(pool);
    expect(q?.alternatives).toHaveLength(3);
  });

  it("correct answer index points to the correct alternative", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const candidates: QuizCandidate[] = [
      { id: "q1", question: "Q?", questionArgs: [], correctAnswer: "right", domain: "d" },
    ];
    const pool: QuizPool = {
      candidates,
      domainOptions: new Map([["d", ["right", "wrong1", "wrong2"]]]),
    };
    const q = drawQuestion(pool)!;
    expect(q.alternatives[q.correctAnswer]).toBe("right");
  });

  it("prefers unseen candidates over recently-seen ones", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const c1: QuizCandidate = { id: "q1", question: "Q?", questionArgs: [], correctAnswer: "a", domain: "d" };
    const c2: QuizCandidate = { id: "q2", question: "Q?", questionArgs: [], correctAnswer: "b", domain: "d" };
    const pool: QuizPool = {
      candidates: [c1, c2],
      domainOptions: new Map([["d", ["a", "b", "c"]]]),
    };
    const q = drawQuestion(pool, ["q1"]);
    expect(q?.id).toBe("q2");
  });

  it("falls back to the full pool when all candidates are recent", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const c1: QuizCandidate = { id: "q1", question: "Q?", questionArgs: [], correctAnswer: "a", domain: "d" };
    const pool: QuizPool = {
      candidates: [c1],
      domainOptions: new Map([["d", ["a", "b", "c"]]]),
    };
    const q = drawQuestion(pool, ["q1"]);
    expect(q?.id).toBe("q1");
  });
});
