import { useContext, useEffect, useMemo, useState } from "react";
import { Button, Card, Form } from "react-bootstrap";
import { TranslatorContext } from "./i18n";
import "./Quiz.css";
import { type GradeName, type GradePlan, type WordListEntry } from "./data";
import wordList from "./assets/word-list.json";
import kamokuhyo from "./assets/kamokuhyo.json";
import { buildQuizPool, drawQuestion, type QuizQuestion } from "./quiz-logic";
import { load } from "./persistence/data";

const highScoreData = load<number>("quizStreakHighScore", 0);

interface QuizProps {
  myGrade: GradeName;
}

const Quiz = (props: QuizProps) => {
  const { myGrade } = props;
  const quizPool = useMemo(() => buildQuizPool(myGrade, wordList as WordListEntry[], kamokuhyo as GradePlan[]), [myGrade]);
  const [quizCard, setQuizCard] = useState<QuizQuestion | null>(() => drawQuestion(quizPool));
  const [recentQuestionIds, setRecentQuestionIds] = useState<string[]>([]);
  const [answer, setAnswer] = useState<number | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [highScore, setHighScore] = useState(highScoreData.data ?? 0);

  const translator = useContext(TranslatorContext);

  useEffect(() => {
    const initialQuestion = drawQuestion(quizPool);
    setQuizCard(initialQuestion);
    setRecentQuestionIds(initialQuestion ? [initialQuestion.id] : []);
    setAnswer(null);
    setShowBack(false);
    setCurrentStreak(0);
  }, [quizPool]);

  useEffect(() => {
    return highScoreData.registerListener((newHighScore) => {
      setHighScore(newHighScore);
    });
  }, []);

  const showAnswer = () => {
    setCurrentStreak(0);
    setShowBack(true);
  };

  const submitAnswer = () => {
    if (answeredCorrectly) {
      const newStreak = currentStreak + 1;
      setCurrentStreak(newStreak);
      if (newStreak > highScore) {
        highScoreData.save(newStreak);
        setHighScore(newStreak);
      }
    } else {
      setCurrentStreak(0);
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
                    {translator.translate(quizCard.question, { params: quizCard.questionArgs })}
                  </h1>
                  <div className="quiz-alternatives">{alternatives}</div>
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
              </Card.Body>

            </Card>
          </div>
        </div>
      </div>

      <div className="quiz-streak">
        <span>{translator.translate("Streak")}: <strong>{currentStreak}</strong></span>
        <span>{translator.translate("Rekord")}: <strong>{highScore}</strong></span>
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
