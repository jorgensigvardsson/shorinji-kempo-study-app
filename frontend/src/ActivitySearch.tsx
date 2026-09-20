import { useContext, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Form } from "react-bootstrap";
import { ArrowRight, Star, StarFill } from "react-bootstrap-icons";
import type { GradePlan } from "./data";
import { TranslatorContext } from "./i18n";
import { availableActivities } from "./navigation";
import { NavigationMemory } from "./navigation-memory-context";
import { searchScore, techniqueCatalogue } from "./activity-search";
import { beginNavigation } from "./navigation-pending";
import wordList from "./assets/word-list.json";
import "./ActivitySearch.css";

const searchKinds = { all: "Alla", functions: "Funktioner", techniques: "Tekniker", words: "Ordlista" } as const;
type SearchKind = keyof typeof searchKinds;

export default function ActivitySearch({ allGradePlans }: { allGradePlans: GradePlan[] }) {
    const translator = useContext(TranslatorContext);
    const memory = useContext(NavigationMemory);
    const [params, setParams] = useSearchParams();
    const query = params.get("q") ?? "";
    const requestedKind = params.get("kind") ?? "all";
    const kind: SearchKind = requestedKind in searchKinds && !(translator.isJapanese && requestedKind === "words")
        ? requestedKind as SearchKind : "all";
    const update = (key: string, value: string) => {
        const next = new URLSearchParams(params);
        if (value) next.set(key, value); else next.delete(key);
        setParams(next, { replace: true, preventScrollReset: true });
    };
    const catalogue = useMemo(() => techniqueCatalogue(allGradePlans), [allGradePlans]);
    const functions = availableActivities(translator.isJapanese)
        .map(activity => ({ activity, score: searchScore(query, translator.translate(activity.title), [activity.title, translator.translate(activity.section)]) }))
        .filter(result => result.score > 0).sort((a, b) => b.score - a.score);
    const techniques = query.trim() || kind === "techniques" ? catalogue
        .map(entry => ({ ...entry, score: searchScore(query, entry.hokei.hokei_name, [
            translator.translate(entry.hokei.hokei_name), translator.japanese(entry.hokei.hokei_name),
            entry.hokei.technique_group, translator.translate(entry.hokei.technique_group),
            ...entry.hokei.variations, ...entry.hokei.variations.map(term => translator.translate(term)),
            entry.grade, translator.translate(entry.grade),
        ]) }))
        .filter(result => result.score > 0).sort((a, b) => b.score - a.score) : [];
    const words = !translator.isJapanese && query.trim() ? wordList
        .map(word => ({ word, score: searchScore(query, word.romaji ?? "", [word.kanji ?? "", ...(word.meanings ?? []).map(meaning => translator.translate(meaning))]) }))
        .filter(result => result.score > 0).sort((a, b) => b.score - a.score) : [];
    const showFunctions = kind === "all" || kind === "functions";
    const showTechniques = kind === "all" || kind === "techniques";
    const showWords = kind === "all" || kind === "words";
    const count = (showFunctions ? functions.length : 0) + (showTechniques ? techniques.length : 0) + (showWords ? words.length : 0);

    return <div className="activity-search">
        <header>
            <h1 className="app-page-heading">{translator.translate("Sök")}</h1>
            <p className="app-intro-copy">{translator.translate("Hitta direkt till det du vill göra.")}</p>
        </header>
        <Form.Label htmlFor="activity-search-field">{translator.translate("Sök funktion, teknik eller ord")}</Form.Label>
        <Form.Control id="activity-search-field" type="search" enterKeyHint="search" value={query}
            onChange={event => update("q", event.target.value)}
            onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur(); }} />
        <div className="search-kinds" role="group" aria-label={translator.translate("Visa sökresultat")}> 
            {Object.entries(searchKinds).filter(([key]) => key !== "words" || !translator.isJapanese).map(([key, title]) =>
                <button key={key} type="button" className="btn btn-sm btn-outline-secondary" aria-pressed={kind === key}
                    onClick={() => update("kind", key)}>{translator.translate(title)}</button>)}
        </div>
        {query.trim() && <p className="navigation-caption" role="status">{translator.translate("{0} träffar", { params: [String(count)] })}</p>}
        {count === 0 && <p>{translator.translate(query.trim() ? "Prova ett annat sökord." : "Skriv ett ord för att söka.")}</p>}
        {showFunctions && functions.length > 0 && <section aria-labelledby="search-functions-heading">
            <h2 id="search-functions-heading" className="app-eyebrow-heading">{translator.translate("Funktioner")}</h2>
            <p className="navigation-caption">{translator.translate("Stjärnmarkera funktioner i Sök för att lägga till genvägar.")}</p>
            <ul className="search-results">
                {functions.map(({ activity }) => <li key={activity.path}>
                    <Link to={activity.path} onClick={() => beginNavigation(activity.path)}>
                        <activity.icon size={20} aria-hidden="true" />
                        <span><strong>{translator.translate(activity.title)}</strong><small>{translator.translate(activity.section)}</small></span>
                        <ArrowRight aria-hidden="true" />
                    </Link>
                    <button type="button" className="search-pin" aria-pressed={memory.pins.includes(activity.path)}
                        aria-label={translator.translate(memory.pins.includes(activity.path) ? "Ta bort genväg till {0}" : "Lägg till genväg till {0}", { params: [translator.translate(activity.title)] })}
                        onClick={() => memory.togglePin(activity.path)}>
                        {memory.pins.includes(activity.path) ? <StarFill aria-hidden="true" /> : <Star aria-hidden="true" />}
                    </button>
                </li>)}
            </ul>
        </section>}
        {showTechniques && techniques.length > 0 && <section aria-labelledby="search-techniques-heading">
            <h2 id="search-techniques-heading" className="app-eyebrow-heading">{translator.translate("Tekniker")} ({techniques.length})</h2>
            <ul className="search-results">
                {techniques.map(({ hokei, grade }) => {
                    const path = `/technique/${encodeURIComponent(hokei.id)}`;
                    return <li key={hokei.id}><Link to={path} onClick={() => beginNavigation(path)}>
                        <span><strong>{translator.translate(hokei.hokei_name, { capitalize: true })}{hokei.variations.length > 0 && ` (${hokei.variations.map(term => translator.translate(term)).join(", ")})`}</strong>
                            <small>{translator.translate(grade)} · {translator.translate(hokei.technique_group)}</small></span>
                        <ArrowRight aria-hidden="true" />
                    </Link></li>;
                })}
            </ul>
        </section>}
        {showWords && words.length > 0 && <section aria-labelledby="search-words-heading">
            <h2 id="search-words-heading" className="app-eyebrow-heading">{translator.translate("Ordlista")} ({words.length})</h2>
            <ul className="search-results search-word-results">
                {words.map(({ word }) => <li key={word.id}>
                    <div><strong>{word.romaji}</strong> <span>{word.kanji}</span>
                        <p>{word.meanings?.map(meaning => translator.translate(meaning)).join(" · ")}</p></div>
                </li>)}
            </ul>
        </section>}
    </div>;
}
