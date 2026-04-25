import type { WordListEntry } from "./data";
import wordList from './assets/word-list.json';
import { Button, ButtonGroup, Form } from "react-bootstrap";
import { useContext, useState } from "react";
import { matchesString } from "./strings";
import { TranslatorContext, type Translator } from "./i18n";
import "./WordList.css";

type SortKey = "kanji" | "romaji" | "meaning";

const WordList = () => {
    const translator = useContext(TranslatorContext);
    const [filterText, setFilterText] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("romaji");
    const filteredEntries = wordList
        .filter(e => matches(e, filterText, translator))
        .sort((a, b) => orderEntries(a, b, sortKey, translator));

    return (
        <div>
            <div className="app-grid-panel">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
                    <h2 className="app-grid-title mb-0">{translator.translate("Ordlista")}</h2>
                    <div className="wordlist-count">{filteredEntries.length} {translator.translate("resultat")}</div>
                </div>

                <Form.Control placeholder={translator.translate("Filtrera...")}
                            value={filterText} onChange={e => setFilterText(e.target.value)}
                            name="filter"/>

                <div className="d-flex align-items-center gap-2 mt-3">
                    <span className="wordlist-sort-label">{translator.translate("Sortera")}:</span>
                    <ButtonGroup size="sm">
                        <Button variant={sortKey === "kanji" ? "primary" : "outline-secondary"} onClick={() => setSortKey("kanji")}>
                            {translator.translate("Kanji")}
                        </Button>
                        <Button variant={sortKey === "romaji" ? "primary" : "outline-secondary"} onClick={() => setSortKey("romaji")}>
                            {translator.translate("Romaji")}
                        </Button>
                        <Button variant={sortKey === "meaning" ? "primary" : "outline-secondary"} onClick={() => setSortKey("meaning")}>
                            {translator.translate("Betydelse")}
                        </Button>
                    </ButtonGroup>
                </div>
            </div>

            {filteredEntries.length === 0 && (
                <div className="app-grid-panel">
                    <h3 className="app-grid-title mb-1">{translator.translate("Inga träffar")}</h3>
                    <div className="app-grid-subtitle">{translator.translate("Prova ett annat sökord.")}</div>
                </div>
            )}

            {filteredEntries.length > 0 && (
                <div className="wordlist-table-wrapper app-grid-card mt-2">
                    <table className="table table-sm mb-0 wordlist-table">
                        <thead>
                            <tr>
                                <th>{translator.translate("Kanji")}</th>
                                <th>{translator.translate("Romaji")}</th>
                                <th>{translator.translate("Betydelse")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEntries.map(we => createWordListRow(we, translator))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

const orderEntries = (a: WordListEntry, b: WordListEntry, sortKey: SortKey, translator: Translator) => {
    if (sortKey === "kanji")
        return compareText(a.kanji, b.kanji);

    if (sortKey === "meaning")
        return compareText(firstMeaning(a, translator), firstMeaning(b, translator));

    return compareText(a.romaji, b.romaji);
}

const compareText = (a?: string, b?: string) => {
    if (!a && !b)
        return 0;
    if (a && !b)
        return 1;
    if (!a && b)
        return -1;
    return a!.localeCompare(b!);
}

const firstMeaning = (entry: WordListEntry, translator: Translator) => {
    if (!entry.meanings || entry.meanings.length === 0)
        return undefined;
    return translator.translate(entry.meanings[0]);
}

const createWordListRow = (entry: WordListEntry, translator: Translator) => {
    const meanings = [];
    let index = 0;
    if (entry.meanings) {
        for (const meaning of entry.meanings) {
            if(meanings.length > 0)
                meanings.push(<br key={index++}/>);
            meanings.push(<span key={index++}>{translator.translate(meaning)}</span>);
        }
    }

    return (
        <tr key={entry.index}>
            <td className="top-align-cell">{entry.kanji}</td>
            <td className="top-align-cell">{entry.romaji}</td>
            <td className="top-align-cell">{meanings}</td>
        </tr>
    );
}

const matches = (entry: WordListEntry, filterText: string, translator: Translator) => {
    return entry.kanji && entry.kanji.indexOf(filterText) >= 0 ||
           entry.romaji && matchesString(entry.romaji, filterText) ||
           entry.meanings && entry.meanings.some(m => matchesString(translator.translate(m), filterText));
}

export default WordList;
