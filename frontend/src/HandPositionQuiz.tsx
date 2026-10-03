import { useContext, useMemo } from "react";
import { Form } from "react-bootstrap";
import kamokuhyo from "./assets/kamokuhyo.json";
import type { GradeName, GradePlan } from "./data";
import { useBrowserState } from "./browser-state";
import { TranslatorContext } from "./i18n";
import { buildHandPositionQuizPool, isQuizGradeSelection, type QuizGradeSelection } from "./quiz-logic";
import QuizRunner from "./QuizRunner";
import { gradeLabel } from "./strings";

const gradePlans = kamokuhyo as GradePlan[];

interface HandPositionQuizProps {
  myGrade: GradeName;
}

const HandPositionQuiz = ({ myGrade }: HandPositionQuizProps) => {
  const translator = useContext(TranslatorContext);
  // Remembered on this device, so coming back to the quiz finds it as it was left.
  const [savedSelection, setGradeSelection] = useBrowserState<QuizGradeSelection>(
    "quiz-grade:hand-position", "up-to-own", isQuizGradeSelection, true);
  const availableGrades = useMemo(
    () => gradePlans
      .filter(plan => buildHandPositionQuizPool([plan], myGrade, "all").candidates.length > 0)
      .map(plan => plan.grade),
    [myGrade],
  );
  // A remembered grade that no longer has questions would leave the picker
  // showing nothing, so it falls back to the default.
  const gradeSelection: QuizGradeSelection =
    savedSelection === "all" || savedSelection === "own" || savedSelection === "up-to-own"
      || availableGrades.includes(savedSelection)
      ? savedSelection
      : "up-to-own";
  const quizPool = useMemo(
    () => buildHandPositionQuizPool(gradePlans, myGrade, gradeSelection),
    [myGrade, gradeSelection],
  );
  const controls = (
    <div className="quiz-controls">
      <Form.Label htmlFor="hand-position-quiz-grade-selection">{translator.translate("Teknikurval")}</Form.Label>
      <Form.Select
        id="hand-position-quiz-grade-selection"
        value={gradeSelection}
        onChange={event => setGradeSelection(event.target.value as QuizGradeSelection)}
      >
        <option value="up-to-own">{translator.translate("Alla till och med egna")}</option>
        <option value="own">{translator.translate("Endast egna")}</option>
        <option value="all">{translator.translate("Alla")}</option>
        <optgroup label={translator.translate("Välj grad")}>
          {availableGrades.map(grade => (
            <option value={grade} key={grade}>{gradeLabel(grade, translator)}</option>
          ))}
        </optgroup>
      </Form.Select>
    </div>
  );

  return (
    <QuizRunner
      title={translator.translate("Handpositionsquiz")}
      quizPool={quizPool}
      controls={controls}
    />
  );
};

export default HandPositionQuiz;
