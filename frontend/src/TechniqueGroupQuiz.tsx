import { useContext, useMemo, useState } from "react";
import kamokuhyo from "./assets/kamokuhyo.json";
import { FocusChoicePicker } from "./components/TrainingPageControls";
import type { GradeName, GradePlan } from "./data";
import { TranslatorContext } from "./i18n";
import { buildTechniqueGroupQuizPool, type QuizGradeSelection } from "./quiz-logic";
import QuizRunner from "./QuizRunner";
import { gradeLabel } from "./strings";

const gradePlans = kamokuhyo as GradePlan[];

interface TechniqueGroupQuizProps {
  myGrade: GradeName;
}

const TechniqueGroupQuiz = ({ myGrade }: TechniqueGroupQuizProps) => {
  const translator = useContext(TranslatorContext);
  const [gradeSelection, setGradeSelection] = useState<QuizGradeSelection>(myGrade);
  const quizPool = useMemo(
    () => buildTechniqueGroupQuizPool(gradePlans, myGrade, gradeSelection),
    [myGrade, gradeSelection],
  );
  const availableGrades = useMemo(
    () => gradePlans
      .filter(plan => plan.grade === myGrade || buildTechniqueGroupQuizPool([plan], myGrade, "all").candidates.length > 0)
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
      title={translator.translate("Teknikgruppsquiz")}
      quizPool={quizPool}
      controls={controls}
    />
  );
};

export default TechniqueGroupQuiz;
