import { useContext, useMemo, useState } from "react";
import { FocusChoicePicker } from "./components/TrainingPageControls";
import kamokuhyo from "./assets/kamokuhyo.json";
import type { GradeName, GradePlan } from "./data";
import { TranslatorContext } from "./i18n";
import { buildFootStanceQuizPool, type QuizGradeSelection } from "./quiz-logic";
import QuizRunner from "./QuizRunner";
import { gradeLabel } from "./strings";

const gradePlans = kamokuhyo as GradePlan[];

interface FootStanceQuizProps {
  myGrade: GradeName;
}

const FootStanceQuiz = ({ myGrade }: FootStanceQuizProps) => {
  const translator = useContext(TranslatorContext);
  const [gradeSelection, setGradeSelection] = useState<QuizGradeSelection>(myGrade);
  const quizPool = useMemo(
    () => buildFootStanceQuizPool(gradePlans, myGrade, gradeSelection),
    [myGrade, gradeSelection],
  );
  const availableGrades = useMemo(
    () => gradePlans
      .filter(plan => plan.grade === myGrade || buildFootStanceQuizPool([plan], myGrade, "all").candidates.length > 0)
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
      title={translator.translate("Fotställningsquiz")}
      quizPool={quizPool}
      controls={controls}
    />
  );
};

export default FootStanceQuiz;
