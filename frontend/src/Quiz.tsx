import { useContext } from "react";
import { HandIndex, JournalText, QuestionSquare } from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";
import Grid, { type GridItem } from "./components/Grid";
import { TranslatorContext } from "./i18n";
import "./Quiz.css";

const Quiz = () => {
  const translator = useContext(TranslatorContext);
  const navigate = useNavigate();
  const items: GridItem[] = [
    {
      key: "word-list-quiz",
      title: translator.translate("Ordlistequiz"),
      subtitle: translator.translate("Öva ord, betydelser och tekniknamn."),
      icon: <JournalText />,
      onSelect: () => navigate("/quiz/words"),
      navigatesTo: "/quiz/words",
    },
    {
      key: "foot-stance-quiz",
      title: translator.translate("Fotställningsquiz"),
      subtitle: translator.translate("Öva på tai gamae, hiraki gamae eller båda."),
      icon: <QuestionSquare />,
      onSelect: () => navigate("/quiz/foot-stance"),
      navigatesTo: "/quiz/foot-stance",
    },
    {
      key: "hand-position-quiz",
      title: translator.translate("Handpositionsquiz"),
      subtitle: translator.translate("Öva handpositioner som ichiji gamae, hassō gamae och chūdan gamae."),
      icon: <HandIndex />,
      onSelect: () => navigate("/quiz/hand-position"),
      navigatesTo: "/quiz/hand-position",
    },
  ];

  return (
    <div className="quiz-menu-page">
      <header className="quiz-menu-header">
        <h1 className="app-page-heading">{translator.translate("Quiz")}</h1>
        <p className="app-intro-copy">{translator.translate("Välj vilket quiz du vill göra.")}</p>
      </header>
      <Grid items={items} className="quiz-choice-grid" />
    </div>
  );
};

export default Quiz;
