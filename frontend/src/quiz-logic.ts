import { getHokeiMoments, type GradeName, type GradePlan, type WordListEntry } from "./data";
import { quizMeaningEntryIds } from "./quiz-word-list-ids";
import { compareGrades } from "./utilities/level";

export interface QuizCandidate {
  id: string;
  question: string;
  questionArgs: string[];
  correctAnswer: string;
  domain: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  questionArgs: string[];
  alternatives: string[];
  correctAnswer: number;
}

export interface QuizPool {
  candidates: QuizCandidate[];
  domainOptions: Map<string, string[]>;
}

export type QuizGradeSelection = "all" | "own" | "up-to-own" | GradeName;

const FOOT_STANCE_DOMAIN = "foot_stance";
const TAI_GAMAE = "tai gamae";
const HIRAKI_GAMAE = "hiraki gamae";
const BOTH_FOOT_STANCES = "Båda";
const HAND_POSITION_DOMAIN = "hand_position";

export const buildFootStanceQuizPool = (
  plans: GradePlan[],
  myGrade: GradeName,
  selection: QuizGradeSelection,
): QuizPool => {
  const candidates: QuizCandidate[] = [];
  const seen = new Set<string>();

  for (const plan of plans) {
    if (!matchesGradeSelection(plan.grade, myGrade, selection))
      continue;

    for (const week of plan.weeks) {
      for (const moment of getHokeiMoments(week)) {
        const hokeiName = normalizeText(moment.hokei_name);
        const stances = new Set(moment.foot_stance.map(normalizeKey));
        const hasTai = stances.has(TAI_GAMAE);
        const hasHiraki = stances.has(HIRAKI_GAMAE);

        if (!hokeiName || (!hasTai && !hasHiraki))
          continue;

        const correctAnswer = hasTai && hasHiraki
          ? BOTH_FOOT_STANCES
          : hasTai ? TAI_GAMAE : HIRAKI_GAMAE;
        const variations = moment.variations.map(normalizeText).filter(Boolean);
        const techniqueLabel = variations.length > 0
          ? `${hokeiName} (${variations.join(", ")})`
          : hokeiName;
        const dedupeKey = `${normalizeKey(techniqueLabel)}|${normalizeKey(correctAnswer)}`;

        if (seen.has(dedupeKey))
          continue;

        seen.add(dedupeKey);
        candidates.push({
          id: `foot_stance.${moment.id}`,
          question: `Vilken fotställning används i "{0}"?`,
          questionArgs: [techniqueLabel],
          correctAnswer,
          domain: FOOT_STANCE_DOMAIN,
        });
      }
    }
  }

  return {
    candidates,
    domainOptions: new Map([[FOOT_STANCE_DOMAIN, [TAI_GAMAE, HIRAKI_GAMAE, BOTH_FOOT_STANCES]]]),
  };
};

export const buildHandPositionQuizPool = (
  plans: GradePlan[],
  myGrade: GradeName,
  selection: QuizGradeSelection,
): QuizPool => {
  const candidates: QuizCandidate[] = [];
  const handPositions: string[] = [];
  const seen = new Set<string>();

  // Distractors come from the real hand positions in the whole curriculum, not
  // only the selected grade. Early grades otherwise have too few distinct
  // positions to make a three-choice question.
  for (const plan of plans) {
    for (const week of plan.weeks) {
      for (const moment of getHokeiMoments(week)) {
        for (const role of [moment.roles.attacker, moment.roles.defender]) {
          const position = normalizeText(role.stance);
          if (isHandPosition(position) && !containsNormalized(handPositions, position))
            handPositions.push(position);
        }
      }
    }
  }

  const roles = [
    { key: "attacker", question: "Vilken handposition har angriparen i \"{0}\"?" },
    { key: "defender", question: "Vilken handposition har försvararen i \"{0}\"?" },
  ] as const;

  for (const plan of plans) {
    if (!matchesGradeSelection(plan.grade, myGrade, selection))
      continue;

    for (const week of plan.weeks) {
      for (const moment of getHokeiMoments(week)) {
        const hokeiName = normalizeText(moment.hokei_name);
        if (!hokeiName)
          continue;

        const variations = moment.variations.map(normalizeText).filter(Boolean);
        const techniqueLabel = variations.length > 0
          ? hokeiName + " (" + variations.join(", ") + ")"
          : hokeiName;

        for (const role of roles) {
          const correctAnswer = normalizeText(moment.roles[role.key].stance);
          if (!isHandPosition(correctAnswer))
            continue;

          const dedupeKey = [role.key, normalizeKey(techniqueLabel), normalizeKey(correctAnswer)].join("|");
          if (seen.has(dedupeKey))
            continue;

          seen.add(dedupeKey);
          candidates.push({
            id: ["hand_position", role.key, moment.id].join("."),
            question: role.question,
            questionArgs: [techniqueLabel],
            correctAnswer,
            domain: HAND_POSITION_DOMAIN,
          });
        }
      }
    }
  }

  return {
    candidates,
    domainOptions: new Map([[HAND_POSITION_DOMAIN, handPositions]]),
  };
};

const isHandPosition = (value: string): boolean => normalizeKey(value).endsWith(" gamae");

const matchesGradeSelection = (
  grade: GradeName,
  myGrade: GradeName,
  selection: QuizGradeSelection,
): boolean => {
  if (selection === "all")
    return true;
  if (selection === "own")
    return grade === myGrade;
  if (selection === "up-to-own")
    return compareGrades(grade, myGrade) <= 0;
  return grade === selection;
};

export const buildQuizPool = (
  myGrade: GradeName,
  wordListData: WordListEntry[],
  plans: GradePlan[],
  includeKanjiReadings: boolean,
): QuizPool => {
  const candidates: QuizCandidate[] = [
    ...buildWordListCandidates(wordListData, includeKanjiReadings),
    ...buildKamokuCandidates(plans, myGrade),
  ];

  const domainOptions = new Map<string, string[]>();
  for (const candidate of candidates) {
    if (!domainOptions.has(candidate.domain))
      domainOptions.set(candidate.domain, []);

    const values = domainOptions.get(candidate.domain)!;
    if (!containsNormalized(values, candidate.correctAnswer))
      values.push(candidate.correctAnswer);
  }

  const viableCandidates = candidates.filter(candidate => (domainOptions.get(candidate.domain)?.length ?? 0) >= 3);
  return { candidates: viableCandidates, domainOptions };
};

export const buildWordListCandidates = (entries: WordListEntry[], includeKanjiReadings = true): QuizCandidate[] => {
  const candidates: QuizCandidate[] = [];

  for (const entry of entries) {
    const romaji = normalizeText(entry.romaji);
    const meanings = (entry.meanings ?? []).map(normalizeText).filter(Boolean);
    const kanji = normalizeText(entry.kanji);

    if (!romaji)
      continue;

    const primaryMeaning = meanings[0];
    const entryId = String(entry.id);

    if (primaryMeaning && quizMeaningEntryIds.has(entry.id)) {
      candidates.push({
        id: `word.meaning.${entryId}`,
        question: `Vad betyder "{0}"?`,
        questionArgs: [romaji],
        correctAnswer: primaryMeaning,
        domain: "word.meaning",
      });

      candidates.push({
        id: `word.romaji_from_meaning.${entryId}`,
        question: `Vilket romaji motsvarar "{0}"?`,
        questionArgs: [primaryMeaning],
        correctAnswer: romaji,
        domain: "word.romaji",
      });
    }

    // In Japanese, showing kanji and asking for its romaji reading only tests a
    // transliteration the reader does not need. Meaning questions still remain.
    if (kanji && includeKanjiReadings) {
      candidates.push({
        id: `word.romaji_from_kanji.${entryId}`,
        question: `Hur läses "{0}" på romaji?`,
        questionArgs: [kanji],
        correctAnswer: romaji,
        domain: "word.romaji",
      });
    }
  }

  return dedupeCandidates(candidates);
};

export const buildKamokuCandidates = (plans: GradePlan[], myGrade: GradeName): QuizCandidate[] => {
  const candidates: QuizCandidate[] = [];

  for (const plan of plans) {
    if (compareGrades(plan.grade, myGrade) > 0)
      continue;

    for (const week of plan.weeks) {
      const hokeiMoments = getHokeiMoments(week);

      for (const moment of hokeiMoments) {
        const hokeiName = normalizeText(moment.hokei_name);
        const techniqueGroup = normalizeText(moment.technique_group);
        const attackerStance = normalizeText(moment.roles.attacker.stance);
        const attackerAction = normalizeText(moment.roles.attacker.action);
        const defenderStance = normalizeText(moment.roles.defender.stance);
        const defenderAction = normalizeText(moment.roles.defender.action);

        if (!hokeiName)
          continue;

        if (techniqueGroup) {
          candidates.push({
            id: `kamoku.technique_group.${plan.grade}.${week.week}.${hokeiName}`,
            question: `Vilken teknikgrupp tillhör "{0}"?`,
            questionArgs: [hokeiName],
            correctAnswer: techniqueGroup,
            domain: "kamoku.technique_group",
          });
        }

        if (attackerStance) {
          candidates.push({
            id: `kamoku.attacker_stance.${plan.grade}.${week.week}.${hokeiName}`,
            question: `Vilken stans har angriparen i "{0}"?`,
            questionArgs: [hokeiName],
            correctAnswer: attackerStance,
            domain: "kamoku.attacker_stance",
          });
        }

        if (attackerAction) {
          candidates.push({
            id: `kamoku.attacker_action.${plan.grade}.${week.week}.${hokeiName}`,
            question: `Vad gör angriparen i "{0}"?`,
            questionArgs: [hokeiName],
            correctAnswer: attackerAction,
            domain: "kamoku.attacker_action",
          });
        }

        if (defenderStance) {
          candidates.push({
            id: `kamoku.defender_stance.${plan.grade}.${week.week}.${hokeiName}`,
            question: `Vilken stans har försvararen i "{0}"?`,
            questionArgs: [hokeiName],
            correctAnswer: defenderStance,
            domain: "kamoku.defender_stance",
          });
        }

        if (defenderAction) {
          candidates.push({
            id: `kamoku.defender_action.${plan.grade}.${week.week}.${hokeiName}`,
            question: `Vad gör försvararen i "{0}"?`,
            questionArgs: [hokeiName],
            correctAnswer: defenderAction,
            domain: "kamoku.defender_action",
          });
        }
      }
    }
  }

  return dedupeCandidates(candidates);
};

export const drawQuestion = (pool: QuizPool, recentQuestionIds: string[] = []): QuizQuestion | null => {
  if (pool.candidates.length === 0)
    return null;

  const unseen = pool.candidates.filter(c => !recentQuestionIds.includes(c.id));
  const source = unseen.length > 0 ? unseen : pool.candidates;
  const candidate = source[Math.floor(Math.random() * source.length)];
  const domainValues = pool.domainOptions.get(candidate.domain) ?? [];
  const distractors = pickDistractors(domainValues, candidate.correctAnswer, 2);

  if (distractors.length < 2)
    return null;

  const alternatives = shuffle([candidate.correctAnswer, ...distractors]);
  return {
    id: candidate.id,
    question: candidate.question,
    questionArgs: candidate.questionArgs,
    alternatives,
    correctAnswer: alternatives.findIndex(option => normalizeKey(option) === normalizeKey(candidate.correctAnswer)),
  };
};

export const pickDistractors = (domainValues: string[], correctAnswer: string, count: number): string[] => {
  const candidates = domainValues.filter(value => normalizeKey(value) !== normalizeKey(correctAnswer));
  const shuffled = shuffle(candidates);
  return shuffled.slice(0, count);
};

export const dedupeCandidates = (candidates: QuizCandidate[]): QuizCandidate[] => {
  const seen = new Set<string>();
  const result: QuizCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.domain}|${normalizeKey(candidate.question)}|${normalizeKey(candidate.correctAnswer)}`;
    if (seen.has(key))
      continue;

    seen.add(key);
    result.push(candidate);
  }

  return result;
};

export const normalizeText = (value?: string): string => {
  if (!value)
    return "";
  return value.replace(/\s+/g, " ").trim();
};

export const normalizeKey = (value: string): string => {
  return normalizeText(value).toLowerCase();
};

export const containsNormalized = (values: string[], value: string): boolean => {
  const target = normalizeKey(value);
  return values.some(v => normalizeKey(v) === target);
};

export const shuffle = <T,>(items: T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
