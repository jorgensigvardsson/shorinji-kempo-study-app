import { Badge, Container } from "react-bootstrap";
import { CardHeading, QuestionSquare } from "react-bootstrap-icons";
import { TranslatorContext } from "./i18n";
import { type ComponentType, useContext } from "react";
import { useNavigate } from "react-router";
import Grid, { type GridItem } from "./Grid";

interface StartAction {
    key: string;
    title: string;
    japanese: string;
    description: string;
    to: string;
    icon: ComponentType<{ size?: number; className?: string }>;
}

const Start = () => {
    const translator = useContext(TranslatorContext);
    const navigate = useNavigate();

    const actions: StartAction[] = [
        {
            key: "quiz",
            title: translator.translate("Quiz"),
            japanese: translator.japanese("Quiz"),
            description: translator.translate("Svara på frågor och repetera tekniknamn i tempo."),
            to: "/quiz",
            icon: QuestionSquare,
        },
        {
            key: "flashcard",
            title: translator.translate("Flashkort"),
            japanese: translator.japanese("Flashkort"),
            description: translator.translate("Öva med kort och bygg minnet steg för steg."),
            to: "/flashcard",
            icon: CardHeading,
        },
    ];

    const items: GridItem[] = actions.map((action) => ({
        key: action.key,
        title: action.title,
        icon: <action.icon size={20} />,
        badge: <Badge bg="secondary">{translator.translate("Starta")}</Badge>,
        subtitle: !translator.isJapanese ? action.japanese : undefined,
        preview: <div className="app-grid-preview-item">{action.description}</div>,
        onSelect: () => navigate(action.to),
    }));

    return (
        <Container className="p-3">
            <div className="app-grid-panel mb-3">
                <h2 className="app-grid-title mb-1">{translator.translate("Vad vill du göra idag?")}</h2>
            </div>
            <Grid items={items} />
        </Container>
    );
};

export default Start;
