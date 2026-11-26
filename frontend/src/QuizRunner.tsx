import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Card, Form } from "react-bootstrap";
import { TranslatorContext } from "./i18n";
import "./Quiz.css";
import "./components/StudySession.css";
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
  finite?: boolean;
}

const QuizRunner = ({ title, quizPool, controls, finite = false }: QuizRunnerProps) => {
  const translator = useContext(TranslatorContext);
  const [quizCard, setQuizCard] = useState<QuizQuestion | null>(() => drawQuestion(quizPool));
  const [recentQuestionIds, setRecentQuestionIds] = useState<string[]>(() => quizCard ? [quizCard.id] : []);
  const [answer, setAnswer] = useState<number | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const totalQuestions = new Set(quizPool.candidates.map(candidate => candidate.id)).size;
  const [currentStreak, setCurrentStreak] = useState(currentStreakData.data ?? 0);
  const [highScore, setHighScore] = useState(highScoreData.data ?? 0);
  const [sessionSource, setSessionSource] = useState({ pool: quizPool, finite });
  const previousSource = useRef(sessionSource);

  const saveCurrentStreak = (streak: number) => {
    currentStreakData.save(streak);
    setCurrentStreak(streak);
  };

  // Adjust the session before rendering a newly selected pool. The first
  // question and its history are initialized together, so no extra draw occurs.
  if (sessionSource.pool !== quizPool || sessionSource.finite !== finite) {
    const initialQuestion = drawQuestion(quizPool);
    setSessionSource({ pool: quizPool, finite });
    setQuizCard(initialQuestion);
    setRecentQuestionIds(initialQuestion ? [initialQuestion.id] : []);
    setAnswer(null);
    setShowBack(false);
    setCompleted(false);
    setCorrectAnswers(0);

    setCurrentStreak(0);
  }

  useEffect(() => {
    // Persist a reset only when the new selection commits. Mounting the quiz
    // still picks up the saved streak as before.
    if (previousSource.current !== sessionSource) {
      previousSource.current = sessionSource;
      currentStreakData.save(0);
    }
  }, [sessionSource]);

  useEffect(() => {
    return highScoreData.registerListener((newHighScore) => {
      setHighScore(newHighScore);
    });
  }, []);

  const answeredCorrectly = answer !== null && quizCard !== null && answer === quizCard.correctAnswer;

  const showAnswer = () => {
    if (showBack) return;
    if (finite) setAnswer(null);
    saveCurrentStreak(0);
    setShowBack(true);
  };

  const submitAnswer = () => {
    if (showBack || answer === null) return;
    if (answeredCorrectly) {
      if (finite) setCorrectAnswers(previous => previous + 1);
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
    if (finite && recentQuestionIds.length >= totalQuestions) {
      setCompleted(true);
      return;
    }
    const nextQuestion = drawQuestion(quizPool, recentQuestionIds);
    if (!nextQuestion)
      return;

    setQuizCard(nextQuestion);
    setRecentQuestionIds(prev => finite ? [nextQuestion.id, ...prev] : [nextQuestion.id, ...prev].slice(0, 20));
    setAnswer(null);
    setShowBack(false);
  };

  const restartRound = () => {
    const firstQuestion = drawQuestion(quizPool);
    setQuizCard(firstQuestion);
    setRecentQuestionIds(firstQuestion ? [firstQuestion.id] : []);
    setAnswer(null);
    setShowBack(false);
    setCompleted(false);
    setCorrectAnswers(0);
    saveCurrentStreak(0);
  };

  const header = (
    <header className="quiz-session-header">
      <h1 className="app-page-heading quiz-page-heading">{title}</h1>
      {controls}
      {finite && !completed && quizCard && <p className="quiz-round-progress">
        {translator.translate("Fråga {0} av {1}", { params: [String(Math.max(1, recentQuestionIds.length)), String(totalQuestions)] })}
      </p>}
    </header>
  );

  if (finite && completed) {
    return <div className="quiz-page study-session quiz-round">
      {header}
      <div className="quiz-scene">
        <Card className="quiz-card">
          <Card.Body className="quiz-body">
            <div className="quiz-main quiz-answer-main">
              <h2 className="quiz-title">{translator.translate("Omgången klar!")}</h2>
              <p className="mb-0">{translator.translate("Du fick {0} av {1} rätt.", { params: [String(correctAnswers), String(totalQuestions)] })}</p>
            </div>
          </Card.Body>
        </Card>
      </div>
      <div className="quiz-actions">
        <Button variant="primary" onClick={restartRound}>{translator.translate("Öva igen")}</Button>
      </div>
    </div>;
  }

  if (!quizCard) {
    return (
      <div className="quiz-page study-session">
        {header}
        <Card className="quiz-card">
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
    <div className={`quiz-page study-session${finite ? " quiz-round" : ""}`}>
      {header}
      <div className={`quiz-scene ${showBack ? "is-flipped" : ""}`}>
        <div className="quiz-inner">
          <div className="quiz-face quiz-front" aria-hidden={showBack} inert={showBack}>
            <Card className="quiz-card">
              <Card.Body className="quiz-body">
                <div className="quiz-main">
                  <h2 className="quiz-title">
                    {translator.translate(quizCard.question, { params: quizCard.questionArgs })}
                  </h2>
                  <div className="quiz-alternatives">{alternatives}</div>
                </div>
                <div className="quiz-streak-footer">
                  <span>{translator.translate("Streak")}: <strong>{currentStreak}</strong></span>
                  <span>{translator.translate("Rekord")}: <strong>{highScore}</strong></span>
                </div>
              </Card.Body>
            </Card>
          </div>

          <div className="quiz-face quiz-back" aria-hidden={!showBack} inert={!showBack}>
            <Card className="quiz-card">
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
          <Button variant="outline-secondary" onClick={showAnswer}>
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
            {translator.translate(finite && recentQuestionIds.length >= totalQuestions ? "Visa resultat" : "Nästa fråga")}
          </Button>
        </div>
      )}
    </div>
  );
};

export default QuizRunner;
