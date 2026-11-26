import { useContext } from "react";
import { Collection, HandIndex, JournalText, QuestionSquare } from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";
import Grid, { type GridItem } from "./components/Grid";
import { TranslatorContext } from "./i18n";
import "./Quiz.css";
import { practiceThemes } from "./practice-themes";

const Quiz = () => {
  const translator = useContext(TranslatorContext);
  const navigate = useNavigate();
  const items: GridItem[] = [
    {
      key: "word-list-quiz",
      title: translator.translate("Ordlista"),
      subtitle: translator.translate("Öva ord, betydelser och tekniknamn."),
      icon: <JournalText />,
      onSelect: () => navigate("/quiz/words"),
      navigatesTo: "/quiz/words",
    },
    {
      key: "commands-quiz",
      title: translator.translate(practiceThemes.commands.title),
      subtitle: translator.translate(practiceThemes.commands.description),
      icon: <JournalText />,
      onSelect: () => navigate("/quiz/commands"),
      navigatesTo: "/quiz/commands",
    },
    {
      key: "body-quiz",
      title: translator.translate(practiceThemes.body.title),
      subtitle: translator.translate(practiceThemes.body.description),
      icon: <HandIndex />,
      onSelect: () => navigate("/quiz/body"),
      navigatesTo: "/quiz/body",
    },
    {
      key: "footwork-quiz",
      title: translator.translate(practiceThemes.footwork.title),
      subtitle: translator.translate(practiceThemes.footwork.description),
      icon: <QuestionSquare />,
      onSelect: () => navigate("/quiz/footwork"),
      navigatesTo: "/quiz/footwork",
    },
    {
      key: "technique-group-quiz",
      title: translator.translate("Teknikgrupper"),
      subtitle: translator.translate("Öva vilken teknikgrupp varje hōkei tillhör."),
      icon: <Collection />,
      onSelect: () => navigate("/quiz/technique-groups"),
      navigatesTo: "/quiz/technique-groups",
    },
    {
      key: "foot-stance-quiz",
      title: translator.translate("Fotposition"),
      subtitle: translator.translate("Öva på att avgöra om tekniken utförs i tai gamae, hiraki gamae eller båda."),
      icon: <QuestionSquare />,
      onSelect: () => navigate("/quiz/foot-stance"),
      navigatesTo: "/quiz/foot-stance",
    },
    {
      key: "hand-position-quiz",
      title: translator.translate("Kamae"),
      subtitle: translator.translate("Öva på angriparens och försvararens kamae."),
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
