import { useContext, type ComponentType } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ClockHistory, Search } from "react-bootstrap-icons";
import Grid, { type GridItem } from "./components/Grid";
import { TranslatorContext } from "./i18n";
import { NavigationMemory } from "./navigation-memory-context";
import { activityForUrl, activityLabel } from "./navigation";
import { beginNavigation } from "./navigation-pending";
import { getTrainingControlContext } from "./training-controls-context";
import "./Navigation.css";

interface StartRouteCard {
    path: string;
    title: string;
    description?: string;
    icon: ComponentType<{ size?: number; className?: string }>;
}

interface Props {
    routes: StartRouteCard[];
    displayName?: string;
}

const Start = (props: Props) => {
    const { routes, displayName } = props;
    const navigate = useNavigate();
    const translator = useContext(TranslatorContext);
    const memory = useContext(NavigationMemory);
    const latest = memory.recent[0];
    const latestActivity = latest && memory.describe(latest.url);
    const trimmedDisplayName = displayName?.trim();
    const greeting = trimmedDisplayName
        ? `${translator.translate("Gasshō")}, ${trimmedDisplayName}`
        : translator.translate("Gasshō");

    const items: GridItem[] = routes.map((route) => ({
        key: route.path,
        title: route.title,
        subtitle: route.description,
        icon: <route.icon size={20} />,
        onSelect: () => navigate(route.path),
        navigatesTo: route.path,
    }));

    return (
        <div className="start-screen">
            {/* The gasshō hands are decoration on top of the word itself, so they
                stay out of the accessible name — a screen reader should read the
                greeting, not "folded hands". */}
            <div className="start-context" aria-label={greeting}>
                {greeting} <span aria-hidden="true">🙏</span>
            </div>
            <header className="start-intro">
                <h1 className="app-page-heading">{translator.translate("Vad vill du göra idag?")}</h1>
            </header>
            <Link to="/search" className="start-search" onClick={() => beginNavigation("/search")}>
                <Search aria-hidden="true" />
                <span>{translator.translate("Sök funktion, teknik eller ord")}</span>
            </Link>
            {latestActivity && <button type="button" className="start-resume" onClick={() => memory.resume(latest)}>
                <ClockHistory size={24} aria-hidden="true" />
                <span>
                    <span className="start-resume-label">{translator.translate("Fortsätt där du slutade")}</span>
                    <strong>{activityLabel(latestActivity, translator)}</strong>
                    <span className="navigation-caption">{translator.translate(latestActivity.section)}{getTrainingControlContext(latestActivity.path).showGrade && ` · ${translator.translate(latest.grade)}`}</span>
                </span>
                <ArrowRight aria-hidden="true" />
            </button>}
            <section className="start-shortcuts" aria-labelledby="shortcuts-heading">
                <div className="navigation-section-heading">
                    <h2 id="shortcuts-heading" className="app-eyebrow-heading">{translator.translate("Mina genvägar")}</h2>
                    <Link to="/search" onClick={() => beginNavigation("/search")}>{translator.translate("Anpassa")}</Link>
                </div>
                <div className="shortcut-grid">
                    {memory.pins.map(path => {
                        const activity = activityForUrl(path)!;
                        return <Link key={path} to={path} className="shortcut-link" onClick={() => beginNavigation(path)}>
                            <activity.icon size={20} aria-hidden="true" />
                            <span>{translator.translate(activity.title)}</span>
                        </Link>;
                    })}
                </div>
                {memory.pins.length === 0 && <p className="navigation-caption">{translator.translate("Stjärnmarkera funktioner i Sök för att lägga till genvägar.")}</p>}
            </section>
            <Grid items={items} className="start-grid" />
            {memory.recent.length > 1 && <section className="start-recent" aria-labelledby="recent-heading">
                <h2 id="recent-heading" className="app-eyebrow-heading">{translator.translate("Senast besökta")}</h2>
                {memory.recent.slice(1).map(visit => <button type="button" key={visit.url} onClick={() => memory.resume(visit)}>
                    <span>{activityLabel(memory.describe(visit.url)!, translator)}</span><ArrowRight aria-hidden="true" />
                </button>)}
            </section>}
        </div>
    );
};

export default Start;
