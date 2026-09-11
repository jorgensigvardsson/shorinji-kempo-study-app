import { useContext } from "react";
import { CardHeading, People } from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";
import Grid, { type GridItem } from "./components/Grid";
import { TranslatorContext } from "./i18n";
import "./Quiz.css";

const FlashcardMenu = () => {
    const translator = useContext(TranslatorContext);
    const navigate = useNavigate();
    const items: GridItem[] = [
        {
            key: "word-flashcards",
            title: translator.translate("Ordlista"),
            subtitle: translator.translate("Öva ord och betydelser."),
            icon: <CardHeading />,
            onSelect: () => navigate("/flashcard/words"),
            navigatesTo: "/flashcard/words",
        },
        {
            key: "hokei-flashcards",
            title: translator.translate("Hokei"),
            subtitle: translator.translate("Öva uppställning, utförande och egna anteckningar."),
            icon: <People />,
            onSelect: () => navigate("/flashcard/hokei"),
            navigatesTo: "/flashcard/hokei",
        },
    ];

    return (
        <div className="quiz-menu-page">
            <header className="quiz-menu-header">
                <h1 className="app-page-heading">{translator.translate("Flashkort")}</h1>
                <p className="app-intro-copy">{translator.translate("Välj vilken typ av flashkort du vill öva på.")}</p>
            </header>
            <Grid items={items} className="quiz-choice-grid" />
        </div>
    );
};

export default FlashcardMenu;
