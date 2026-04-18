import { useContext, useState } from "react";
import { Button, Card, Form } from "react-bootstrap";
import { TranslatorContext } from "./i18n";
import "./Quiz.css";

interface QuizQuestion {
    question: string;
    alternatives: string[];
    correctAnswer: number;
}

const quizCards: QuizQuestion[] = [
    {
        question: "Vad är tsuki?",
        alternatives: [
            "Spark",
            "Kast",
            "Slag"
        ],
        correctAnswer: 2
    },
    {
        question: "Vad är keri?",
        alternatives: [
            "Spark",
            "Kast",
            "Slag"
        ],
        correctAnswer: 0
    }
]

const Quiz = () => {
  const pickQuestionIndex = () => Math.floor(Math.random() * quizCards.length);

  const [questionIndex, setQuestionIndex] = useState(() => pickQuestionIndex());
  const [answer, setAnswer] = useState<number | null>(null);
  const [showBack, setShowBack] = useState(false);

  const quizCard = quizCards[questionIndex];
  const translator = useContext(TranslatorContext);

  const showAnswer = () => {
    setShowBack(true);
  };

  const submitAnswer = () => {
    setShowBack(true);
  };

  const nextCard = () => {
    let nextIndex = questionIndex;

    if (quizCards.length > 1) {
      while (nextIndex === questionIndex) {
        nextIndex = pickQuestionIndex();
      }
    }

    setQuestionIndex(nextIndex);
    setAnswer(null);
    setShowBack(false);
  };

  const alternatives = quizCard.alternatives.map((alternative, index) => (
    <Form.Check
      key={`answer-${questionIndex}-${index}`}
      type="radio"
      name={`answer-${questionIndex}`}
      label={translator.translate(alternative)}
      value={index}
      id={`answer-${questionIndex}-${index}`}
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
            <Card className="quiz-card">
              <Card.Header>
                <h1 className="mb-0">
                  {translator.translate(quizCard.question)}
                </h1>
              </Card.Header>

              <Card.Body className="fs-3 d-flex flex-column justify-content-center">
                <Form>{alternatives}</Form>
              </Card.Body>

              <Card.Footer className="ps-2 pe-2">
                <div className="d-flex flex-row justify-content-between">
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
              </Card.Footer>
            </Card>
          </div>

          <div className="quiz-face quiz-back">
            <Card className="quiz-card">
              <Card.Header>
                <h1 className="mb-0">{translator.translate("Svar")}</h1>
              </Card.Header>

              <Card.Body className="fs-3">
                <div className="mb-3">
                  <strong>{translator.translate("Fråga")}:</strong>{" "}
                  {translator.translate(quizCard.question)}
                </div>

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
                  <div
                    className={answeredCorrectly ? "text-success" : "text-danger"}
                  >
                    <strong>
                      {answeredCorrectly
                        ? translator.translate("Rätt!")
                        : translator.translate("Fel!")}
                    </strong>
                  </div>
                )}
              </Card.Body>

              <Card.Footer className="ps-2 pe-2">
                <div className="d-flex flex-row justify-content-between">
                  <Button variant="secondary" onClick={() => setShowBack(false)}>
                    {translator.translate("Tillbaka")}
                  </Button>
                  <Button variant="primary" onClick={nextCard}>
                    {translator.translate("Nästa kort")}
                  </Button>
                </div>
              </Card.Footer>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Quiz;
