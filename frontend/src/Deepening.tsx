import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { Book, ChatText, Collection, JournalText, Award, People } from "react-bootstrap-icons";
import { TranslatorContext } from "./i18n";
import Grid from "./components/Grid";
import { studyTopics } from "./study-topics";
import "./Theory.css";

const icons = { movements: Book, groups: Collection, language: ChatText, ranks: Award, etiquette: People, philosophy: JournalText };

export default function Deepening() {
    const translator = useContext(TranslatorContext);
    const navigate = useNavigate();
    return <div>
        <header className="theory-page-header">
            <h1 className="app-page-heading">{translator.translate("Fördjupning")}</h1>
            <p className="app-intro-copy">{translator.translate("Läs om rörelser, träningsspråk, grader, etikett och filosofi.")}</p>
        </header>
        <Grid className="theory-choice-grid" items={studyTopics.map(topic => {
            const Icon = icons[topic.key];
            return {
                key: topic.key,
                title: translator.translate(topic.title),
                subtitle: translator.translate(topic.description),
                icon: <Icon />,
                onSelect: () => navigate(topic.path),
                navigatesTo: topic.path,
            };
        })} />
    </div>;
}
