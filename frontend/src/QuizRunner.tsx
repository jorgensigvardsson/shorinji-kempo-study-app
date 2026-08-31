import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Card, Form } from "react-bootstrap";
import { TranslatorContext } from "./i18n";
import "./Quiz.css";
import { drawQuestion, type QuizPool, type QuizQuestion } from "./quiz-logic";
import { load } from "./persistence/data";

const highScoreData = load<number>("quizStreakHighScore", 0);
// The streak in progress is kept on this device only — it belongs to the sitting
// you are in, not to the kenshi the way the record does, so it is not part of the
// synced document. It does survive a reload and leaving the quiz for another page.
const currentStreakData = load<number>("quizStreakCurrent", 0);

interface QuizRunnerProps {
  title: string;
  quizPool: QuizPool;
  controls?: ReactNode;
}

const QuizRunner = ({ title, quizPool, controls }: QuizRunnerProps) => {
  const translator = useContext(TranslatorContext);
  const [quizCard, setQuizCard] = useState<QuizQuestion | null>(() => drawQuestion(quizPool));
  const [recentQuestionIds, setRecentQuestionIds] = useState<string[]>([]);
  const [answer, setAnswer] = useState<number | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(currentStreakData.data ?? 0);
  const [highScore, setHighScore] = useState(highScoreData.data ?? 0);
  const previousQuizPool = useRef(quizPool);

  const saveCurrentStreak = (streak: number) => {
    currentStreakData.save(streak);
    setCurrentStreak(streak);
  };

  useEffect(() => {
    const initialQuestion = drawQuestion(quizPool);
    setQuizCard(initialQuestion);
    setRecentQuestionIds(initialQuestion ? [initialQuestion.id] : []);
    setAnswer(null);
    setShowBack(false);

    // A new pool means the questions changed under the streak — a grade was picked,
    // say — so it starts over. Mounting the quiz is not such a change: coming back
    // to the page, or reloading the app, picks the streak up where it was left.
    if (previousQuizPool.current !== quizPool) {
      previousQuizPool.current = quizPool;
      saveCurrentStreak(0);
    }
  }, [quizPool]);

  useEffect(() => {
    return highScoreData.registerListener((newHighScore) => {
      setHighScore(newHighScore);
    });
  }, []);

  const answeredCorrectly = answer !== null && quizCard !== null && answer === quizCard.correctAnswer;

  const showAnswer = () => {
    saveCurrentStreak(0);
    setShowBack(true);
  };

  const submitAnswer = () => {
    if (answeredCorrectly) {
      const newStreak = currentStreak + 1;
      saveCurrentStreak(newStreak);
      if (newStreak > highScore) {
        highScoreData.save(newStreak);
        setHighScore(newStreak);
      }
    } else {
      saveCurrentStreak(0);
    }
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

  const header = (
    <>
      <h1 className="app-page-heading quiz-page-heading">{title}</h1>
      {controls}
    </>
  );

  if (!quizCard) {
    return (
      <div className="quiz-page">
        {header}
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

  return (
    <div className="quiz-page">
      {header}
      <div className={`quiz-scene ${showBack ? "is-flipped" : ""}`}>
        <div className="quiz-inner">
          <div className="quiz-face quiz-front">
            <Card className="quiz-card shadow-sm">
              <Card.Body className="quiz-body">
                <div className="quiz-main">
                  <h1 className="quiz-title">
                    {translator.translate(quizCard.question, { params: quizCard.questionArgs })}
                  </h1>
                  <div className="quiz-alternatives">{alternatives}</div>
                </div>
                <div className="quiz-streak-footer">
                  <span>{translator.translate("Streak")}: <strong>{currentStreak}</strong></span>
                  <span>{translator.translate("Rekord")}: <strong>{highScore}</strong></span>
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
                  {translator.translate(quizCard.question, { params: quizCard.questionArgs })}
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
                <div className="quiz-streak-footer">
                  <span>{translator.translate("Streak")}: <strong>{currentStreak}</strong></span>
                  <span>{translator.translate("Rekord")}: <strong>{highScore}</strong></span>
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
          <Button variant="primary" onClick={nextCard}>
            {translator.translate("Nästa fråga")}
          </Button>
        </div>
      )}
    </div>
  );
};

export default QuizRunner;
