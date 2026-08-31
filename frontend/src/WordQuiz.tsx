import { useContext, useMemo } from "react";
import kamokuhyo from "./assets/kamokuhyo.json";
import wordList from "./assets/word-list.json";
import type { GradeName, GradePlan, WordListEntry } from "./data";
import { TranslatorContext } from "./i18n";
import { buildQuizPool } from "./quiz-logic";
import QuizRunner from "./QuizRunner";

interface WordQuizProps {
  myGrade: GradeName;
}

const WordQuiz = ({ myGrade }: WordQuizProps) => {
  const translator = useContext(TranslatorContext);
  const includeKanjiReadings = !translator.isJapanese;
  const quizPool = useMemo(
    () => buildQuizPool(
      myGrade,
      wordList as WordListEntry[],
      kamokuhyo as GradePlan[],
      includeKanjiReadings,
    ),
    [myGrade, includeKanjiReadings],
  );

  return <QuizRunner title={translator.translate("Ordlistequiz")} quizPool={quizPool} />;
};

export default WordQuiz;
