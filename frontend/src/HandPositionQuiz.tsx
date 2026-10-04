import { useContext, useMemo } from "react";
import { FocusChoicePicker } from "./components/TrainingPageControls";
import kamokuhyo from "./assets/kamokuhyo.json";
import type { GradeName, GradePlan } from "./data";
import { useRememberedGradeSelection } from "./grade-selection-memory";
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
  const availableGrades = useMemo(
    () => gradePlans
      .filter(plan => plan.grade === myGrade || buildHandPositionQuizPool([plan], myGrade, "all").candidates.length > 0)
      .map(plan => plan.grade),
    [myGrade],
  );
  const gradeChoices = [
    { value: "all", label: translator.translate("Alla") },
    { value: "up-to-own", label: translator.translate("Alla till och med egna") },
    ...availableGrades.map(grade => ({
      value: grade,
      label: gradeLabel(grade, translator, false),
    })),
  ];
  // Remembered on this device, so coming back finds the quiz as it was left.
  const [gradeSelection, setGradeSelection] = useRememberedGradeSelection<QuizGradeSelection>(
    "hand-position-quiz", myGrade, gradeChoices.map(choice => choice.value));
  const quizPool = useMemo(
    () => buildHandPositionQuizPool(gradePlans, myGrade, gradeSelection),
    [myGrade, gradeSelection],
  );
  const controls = (
    <div className="quiz-controls">
      <FocusChoicePicker
        title={translator.translate("Välj vad du vill träna")}
        leadText={translator.translate("Tränar inför")}
        value={gradeSelection}
        choices={gradeChoices}
        onChange={value => setGradeSelection(value as QuizGradeSelection)}
      />
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
