import { useContext, type ComponentType } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search } from "react-bootstrap-icons";
import Grid, { type GridItem } from "./components/Grid";
import GettingStarted from "./components/GettingStarted";
import OverviewContext from "./components/OverviewContext";
import { TranslatorContext } from "./i18n";
import { NavigationMemory } from "./navigation-memory-context";
import { activityForUrl } from "./navigation";
import { beginNavigation } from "./navigation-pending";
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
            <OverviewContext displayName={displayName} greetingVisible />
            <header className="start-intro">
                <h1 className="app-page-heading">{translator.translate("Vad vill du göra idag?")}</h1>
            </header>
            <GettingStarted />
            {items.length > 0 && <Grid items={items} className="start-grid" />}
            <section className="start-shortcuts" aria-labelledby="shortcuts-heading">
                <div className="navigation-section-heading">
                    <h2 id="shortcuts-heading" className="app-eyebrow-heading">{translator.translate("Mina genvägar")}</h2>
                    <Link to="/shortcuts" onClick={() => beginNavigation("/shortcuts")}>{translator.translate("Anpassa")}</Link>
                </div>
                <div className="shortcut-grid">
                    {memory.pins.map(path => {
                        const activity = activityForUrl(path)!;
                        return <Link key={path} to={path} className="shortcut-link" onClick={() => beginNavigation(path)}>
                            <activity.icon size={22} aria-hidden="true" />
                            <span>{translator.translate(activity.title)}</span>
                        </Link>;
                    })}
                </div>
                {memory.pins.length === 0 && <p className="navigation-caption">{translator.translate("Tryck på Anpassa och stjärnmarkera de funktioner du vill ha här.")}</p>}
            </section>
            <Link to="/search" className="start-search" onClick={() => beginNavigation("/search")}>
                <Search aria-hidden="true" />
                <span>{translator.translate("Sök funktion, teknik eller ord")}</span>
            </Link>
        </div>
    );
};

export default Start;
