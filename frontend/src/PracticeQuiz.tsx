import { useContext, useMemo } from "react";
import { TranslatorContext } from "./i18n";
import QuizRunner from "./QuizRunner";
import { buildPracticeQuizPool, practiceThemes, type PracticeTheme } from "./practice-themes";

export default function PracticeQuiz({ theme }: { theme: PracticeTheme }) {
    const translator = useContext(TranslatorContext);
    const pool = useMemo(() => buildPracticeQuizPool(theme), [theme]);
    return <QuizRunner title={translator.translate(practiceThemes[theme].title)} quizPool={pool} finite />;
}
