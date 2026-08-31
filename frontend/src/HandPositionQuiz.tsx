import { useContext, useMemo, useState } from "react";
import { Form } from "react-bootstrap";
import kamokuhyo from "./assets/kamokuhyo.json";
import type { GradeName, GradePlan } from "./data";
import { TranslatorContext } from "./i18n";
import { buildHandPositionQuizPool, type QuizGradeSelection } from "./quiz-logic";
import QuizRunner from "./QuizRunner";
import { gradeLabel } from "./strings";

const gradePlans = kamokuhyo as GradePlan[];

interface HandPositionQuizProps {
  myGrade: GradeName;
}

const HandPositionQuiz = ({ myGrade }: HandPositionQuizProps) => {
  const translator = useContext(TranslatorContext);
  const [gradeSelection, setGradeSelection] = useState<QuizGradeSelection>("up-to-own");
  const quizPool = useMemo(
    () => buildHandPositionQuizPool(gradePlans, myGrade, gradeSelection),
    [myGrade, gradeSelection],
  );
  const availableGrades = useMemo(
    () => gradePlans
      .filter(plan => buildHandPositionQuizPool([plan], myGrade, "all").candidates.length > 0)
      .map(plan => plan.grade),
    [myGrade],
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
