import type { WordListEntry } from "./data";
import wordList from './assets/word-list.json';
import { Form } from "react-bootstrap";
import { useContext, useState } from "react";
import { matchesString } from "./strings";
import { TranslatorContext, type Translator } from "./i18n";


const WordList = () => {
    const translator = useContext(TranslatorContext);
    const [filterText, setFilterText] = useState("");
    const filteredEntries = wordList.filter(e => matches(e, filterText, translator)).sort(orderEntries);

    return (
        <div className="m-3">
            <Form.Control placeholder={translator.translate("Filtrera...")}
                          value={filterText} onChange={e => setFilterText(e.target.value)}
                          name="filter"/>
            <table className="table table-sm mt-3">
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
    )
}

const orderEntries = (a: WordListEntry, b: WordListEntry) => {
    if (!a.romaji && !b.romaji)
        return 0;

    if (a.romaji && !b.romaji)
        return 1;

    if (!a.romaji && b.romaji)
        return -1;

    return a.romaji!.localeCompare(b.romaji!);
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
