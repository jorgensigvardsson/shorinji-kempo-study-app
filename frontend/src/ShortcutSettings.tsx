import { useContext } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Star, StarFill } from "react-bootstrap-icons";
import BackButton from "./components/BackButton";
import { TranslatorContext } from "./i18n";
import { availableActivities } from "./navigation";
import { NavigationMemory } from "./navigation-memory-context";
import { beginNavigation } from "./navigation-pending";
import "./ActivitySearch.css";
import "./components/ToolPage.css";

export default function ShortcutSettings() {
    const translator = useContext(TranslatorContext);
    const memory = useContext(NavigationMemory);

    return <div className="shortcut-settings">
        <div className="navigation-section-heading">
            <BackButton fallback="/" />
            <Link to="/" className="navigation-caption" onClick={() => beginNavigation("/")}>{translator.translate("Start")}</Link>
        </div>
        <header>
            <h1 className="app-page-heading">{translator.translate("Anpassa genvägar")}</h1>
            <p className="app-intro-copy">{translator.translate("Stjärnmarkera de funktioner du vill ha på startsidan.")}</p>
        </header>
        <ul className="search-results">
            {availableActivities(translator.isJapanese).map(activity => <li key={activity.path}>
                <Link to={activity.path} onClick={() => beginNavigation(activity.path)}>
                    <activity.icon size={20} aria-hidden="true" />
                    <span><strong>{translator.translate(activity.title)}</strong><small>{translator.translate(activity.section)}</small></span>
                    <ArrowRight aria-hidden="true" />
                </Link>
                <button type="button" className="shortcut-pin" aria-pressed={memory.pins.includes(activity.path)}
                    aria-label={translator.translate(memory.pins.includes(activity.path) ? "Ta bort genväg till {0}" : "Lägg till genväg till {0}", { params: [translator.translate(activity.title)] })}
                    onClick={() => memory.togglePin(activity.path)}>
                    {memory.pins.includes(activity.path) ? <StarFill aria-hidden="true" /> : <Star aria-hidden="true" />}
                </button>
            </li>)}
        </ul>
    </div>;
}
