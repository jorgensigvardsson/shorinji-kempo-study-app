import { useContext } from "react";
import { Award, CardHeading, Collection, JournalText, QuestionSquare } from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";
import Grid, { type GridItem } from "./components/Grid";
import { TranslatorContext } from "./i18n";
import "./Theory.css";
import BackButton from "./components/BackButton";

interface TheoryProps {
    showLanguageTools: boolean;
}

const Theory = ({ showLanguageTools }: TheoryProps) => {
    const translator = useContext(TranslatorContext);
    const navigate = useNavigate();
    const items: GridItem[] = [
        {
            key: "technique-groups",
            title: translator.translate("Teknikgrupper"),
            subtitle: translator.translate("Utforska tekniker grupperade efter teknikgrupp."),
            icon: <Collection />,
            onSelect: () => navigate("/theory/groups"),
            navigatesTo: "/theory/groups",
        },
        {
            key: "grading",
            title: translator.translate("Gradering"),
            subtitle: translator.translate("Se krav inför nästa gradering."),
            icon: <Award />,
            onSelect: () => navigate("/theory/grading"),
            navigatesTo: "/theory/grading",
        },
        ...(showLanguageTools ? [{
            key: "word-list",
            title: translator.translate("Ordlista"),
            subtitle: translator.translate("Slå upp ord på kanji, romaji och betydelse."),
            icon: <JournalText />,
            onSelect: () => navigate("/word-list"),
            navigatesTo: "/word-list",
        }] : []),
        ...(showLanguageTools ? [{
            key: "quiz",
            title: translator.translate("Quiz"),
            subtitle: translator.translate("Svara på frågor och repetera tekniknamn i tempo."),
            icon: <QuestionSquare />,
            onSelect: () => navigate("/quiz"),
            navigatesTo: "/quiz",
        }] : []),
        ...(showLanguageTools ? [{
            key: "flashcard",
            title: translator.translate("Flashkort"),
            subtitle: translator.translate("Öva med kort och bygg minnet steg för steg."),
            icon: <CardHeading />,
            onSelect: () => navigate("/flashcard"),
            navigatesTo: "/flashcard",
        }] : []),
    ];

    return (
        <div className="theory-page">
            <BackButton fallback="/" />
            <header className="theory-page-header">
                <h1 className="app-page-heading">{translator.translate("Teori")}</h1>
                <p className="app-intro-copy">{translator.translate("Vad vill du studera idag?")}</p>
            </header>
            <Grid items={items} className="theory-choice-grid" />
        </div>
    );
};

export default Theory;
