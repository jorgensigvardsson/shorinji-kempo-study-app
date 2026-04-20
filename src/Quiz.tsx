import { useContext, useEffect, useMemo, useState } from "react";
import { Button, Card, Form } from "react-bootstrap";
import { TranslatorContext } from "./i18n";
import "./Quiz.css";
import { getHokeiMoments, type GradeName, type GradePlan, type WordListEntry } from "./data";
import wordList from "./assets/word-list.json";
import kamokuhyo from "./assets/kamokuhyo.json";
import { compareLevels } from "./utilities/level";

interface QuizCandidate {
    id: string;
    question: string;
    correctAnswer: string;
    domain: string;
}

interface QuizQuestion {
  id: string;
  question: string;
  alternatives: string[];
  correctAnswer: number;
}

interface QuizPool {
  candidates: QuizCandidate[];
  domainOptions: Map<string, string[]>;
}

interface QuizProps {
  myGrade: GradeName;
}

const Quiz = (props: QuizProps) => {
  const { myGrade } = props;
  const quizPool = useMemo(() => buildQuizPool(myGrade), [myGrade]);
  const [quizCard, setQuizCard] = useState<QuizQuestion | null>(() => drawQuestion(quizPool));
  const [recentQuestionIds, setRecentQuestionIds] = useState<string[]>([]);
  const [answer, setAnswer] = useState<number | null>(null);
  const [showBack, setShowBack] = useState(false);

  const translator = useContext(TranslatorContext);

  useEffect(() => {
    const initialQuestion = drawQuestion(quizPool);
    setQuizCard(initialQuestion);
    setRecentQuestionIds(initialQuestion ? [initialQuestion.id] : []);
    setAnswer(null);
    setShowBack(false);
  }, [quizPool]);

  const showAnswer = () => {
    setShowBack(true);
  };

  const submitAnswer = () => {
    setShowBack(true);
  };

  const nextCard = () => {
    const nextQuestion = drawQuestion(quizPool, recentQuestionIds);
    if (!nextQuestion)
      return;

    setQuizCard(nextQuestion);
    setRecentQuestionIds(prev => [nextQuestion.id, ...prev].slice(0, 20));
    setAnswer(null);
    setShowBack(false);
  };

  if (!quizCard) {
    return (
      <div className="quiz-page">
        <Card className="quiz-card shadow-sm">
          <Card.Body className="quiz-body">
            <div className="quiz-main quiz-answer-main">
              <div>
                <strong>{translator.translate("Inga quizfrågor tillgängliga")}</strong>
              </div>
            </div>
          </Card.Body>
        </Card>
      </div>
    );
  }

  const alternatives = quizCard.alternatives.map((alternative, index) => (
    <Form.Check
      key={`answer-${quizCard.id}-${index}`}
      type="radio"
      name={`answer-${quizCard.id}`}
      label={translator.translate(alternative)}
      value={index}
      id={`answer-${quizCard.id}-${index}`}
      checked={answer === index}
      onChange={() => setAnswer(index)}
    />
  ));

  const selectedAlternative =
    answer !== null ? quizCard.alternatives[answer] : null;

  const correctAlternative =
    quizCard.alternatives[quizCard.correctAnswer];

  const answeredCorrectly = answer === quizCard.correctAnswer;

  return (
    <div className="quiz-page">
      <div className={`quiz-scene ${showBack ? "is-flipped" : ""}`}>
        <div className="quiz-inner">
          <div className="quiz-face quiz-front">
            <Card className="quiz-card shadow-sm">
              <Card.Body className="quiz-body">
                <div className="quiz-main">
                  <h1 className="quiz-title">
                    {translator.translate(quizCard.question)}
                  </h1>
                  <Form className="quiz-alternatives">{alternatives}</Form>
                </div>
              </Card.Body>
            </Card>
          </div>

          <div className="quiz-face quiz-back">
            <Card className="quiz-card shadow-sm">
              <Card.Body className="quiz-body">
                <div className="quiz-main quiz-answer-main">
                  <div className="mb-3">
                  <strong>{translator.translate("Fråga")}:</strong>{" "}
                  {translator.translate(quizCard.question)}
                  </div>

                  {answeredCorrectly ? (
                    <div className="mb-3">
                      <strong className="text-success">{translator.translate("Rätt svar")}:</strong>{" "}
                      {translator.translate(correctAlternative)}
                    </div>
                  ) : (
                    <>
                      {selectedAlternative !== null && (
                        <div className="mb-3">
                          <strong>{translator.translate("Ditt svar")}:</strong>{" "}
                          {translator.translate(selectedAlternative)}
                        </div>
                      )}

                      <div className="mb-3">
                        <strong>{translator.translate("Rätt svar")}:</strong>{" "}
                        {translator.translate(correctAlternative)}
                      </div>

                      {answer !== null && (
                        <div className="text-danger">
                          <strong>{translator.translate("Fel!")}</strong>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Card.Body>

            </Card>
          </div>
        </div>
      </div>

      {!showBack && (
        <div className="quiz-actions">
          <Button variant="danger" onClick={showAnswer}>
            {translator.translate("Visa svar")}
          </Button>
          <Button
            variant="primary"
            disabled={answer === null}
            onClick={submitAnswer}
          >
            {translator.translate("Svara")}
          </Button>
        </div>
      )}

      {showBack && (
        <div className="quiz-actions">
          <Button variant="secondary" onClick={() => setShowBack(false)}>
            {translator.translate("Tillbaka")}
          </Button>
          <Button variant="primary" onClick={nextCard}>
            {translator.translate("Nästa kort")}
          </Button>
        </div>
      )}
    </div>
  );
};

export default Quiz;

const buildQuizPool = (myGrade: GradeName): QuizPool => {
  const candidates: QuizCandidate[] = [
    ...buildWordListCandidates(wordList as WordListEntry[]),
    ...buildKamokuCandidates(kamokuhyo as GradePlan[], myGrade)
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
}

const buildWordListCandidates = (entries: WordListEntry[]): QuizCandidate[] => {
  const candidates: QuizCandidate[] = [];

  for (const entry of entries) {
    const romaji = normalizeText(entry.romaji);
    const meanings = (entry.meanings ?? []).map(normalizeText).filter(Boolean);
    const kanji = normalizeText(entry.kanji);

    if (!romaji || meanings.length === 0)
      continue;

    const primaryMeaning = meanings[0];
    const entryId = String(entry.index);

    candidates.push({
      id: `word.meaning.${entryId}`,
      question: `Vad betyder "${romaji}"?`,
      correctAnswer: primaryMeaning,
      domain: "word.meaning"
    });

    candidates.push({
      id: `word.romaji_from_meaning.${entryId}`,
      question: `Vilket romaji motsvarar "${primaryMeaning}"?`,
      correctAnswer: romaji,
      domain: "word.romaji"
    });

    if (kanji) {
      candidates.push({
        id: `word.romaji_from_kanji.${entryId}`,
        question: `Hur läses "${kanji}" på romaji?`,
        correctAnswer: romaji,
        domain: "word.romaji"
      });
    }
  }

  return dedupeCandidates(candidates);
}

const buildKamokuCandidates = (plans: GradePlan[], myGrade: GradeName): QuizCandidate[] => {
  const candidates: QuizCandidate[] = [];

  for (const plan of plans) {
    if (compareLevels(plan.grade, myGrade) > 0)
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
            question: `Vilken teknikgrupp tillhör "${hokeiName}"?`,
            correctAnswer: techniqueGroup,
            domain: "kamoku.technique_group"
          });
        }

        if (attackerStance) {
          candidates.push({
            id: `kamoku.attacker_stance.${plan.grade}.${week.week}.${hokeiName}`,
            question: `Vilken stans har angriparen i "${hokeiName}"?`,
            correctAnswer: attackerStance,
            domain: "kamoku.attacker_stance"
          });
        }

        if (attackerAction) {
          candidates.push({
            id: `kamoku.attacker_action.${plan.grade}.${week.week}.${hokeiName}`,
            question: `Vad gör angriparen i "${hokeiName}"?`,
            correctAnswer: attackerAction,
            domain: "kamoku.attacker_action"
          });
        }

        if (defenderStance) {
          candidates.push({
            id: `kamoku.defender_stance.${plan.grade}.${week.week}.${hokeiName}`,
            question: `Vilken stans har försvararen i "${hokeiName}"?`,
            correctAnswer: defenderStance,
            domain: "kamoku.defender_stance"
          });
        }

        if (defenderAction) {
          candidates.push({
            id: `kamoku.defender_action.${plan.grade}.${week.week}.${hokeiName}`,
            question: `Vad gör försvararen i "${hokeiName}"?`,
            correctAnswer: defenderAction,
            domain: "kamoku.defender_action"
          });
        }
      }
    }
  }

  return dedupeCandidates(candidates);
}

const drawQuestion = (pool: QuizPool, recentQuestionIds: string[] = []): QuizQuestion | null => {
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
    alternatives,
    correctAnswer: alternatives.findIndex(option => normalizeKey(option) === normalizeKey(candidate.correctAnswer))
  };
}

const pickDistractors = (domainValues: string[], correctAnswer: string, count: number): string[] => {
  const candidates = domainValues.filter(value => normalizeKey(value) !== normalizeKey(correctAnswer));
  const shuffled = shuffle(candidates);
  return shuffled.slice(0, count);
}

const dedupeCandidates = (candidates: QuizCandidate[]): QuizCandidate[] => {
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
}

const normalizeText = (value?: string) => {
  if (!value)
    return "";

  return value.replace(/\s+/g, " ").trim();
}

const normalizeKey = (value: string) => {
  return normalizeText(value).toLowerCase();
}

const containsNormalized = (values: string[], value: string) => {
  const target = normalizeKey(value);
  return values.some(v => normalizeKey(v) === target);
}

const shuffle = <T,>(items: T[]): T[] => {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}
