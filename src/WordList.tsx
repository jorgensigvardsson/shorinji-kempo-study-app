import type { WordListEntry } from "./data";
import wordList from './assets/word-list.json';
import { Form } from "react-bootstrap";
import { useState } from "react";


const WordList = () => {
    const [filterText, setFilterText] = useState("");
    const filteredEntries = wordList.filter(e => matches(e, filterText)).sort(orderEntries);

    return (
        <div className="m-3">
            <Form.Control placeholder={"Filtrera..."}
                          value={filterText} onChange={e => setFilterText(e.target.value)}
                          name="filter"/>
            <table className="table table-sm mt-3">
                <thead>
                    <th>Kanji</th>
                    <th>Romaji</th>
                    <th>Betydelse</th>
                </thead>
                <tbody>
                    {filteredEntries.map(we => createWordListRow(we))}
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


const createWordListRow = (entry: WordListEntry) => {
    let meanings: any = "";

    if (entry.meanings) {
        if (entry.meanings.length === 1) {
            meanings = entry.meanings[0];
        } else {
            meanings = [];
            for (let i = 0; i < entry.meanings.length; ++i) {
                const m = entry.meanings[i];
                meanings.push(m);

                if (i + 1 < entry.meanings.length) {
                    meanings.push(",");
                    meanings.push(<br/>);
                }
            }
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

const matches = (entry: WordListEntry, filterText: string) => {
    return entry.kanji && entry.kanji.indexOf(filterText) >= 0 ||
           entry.romaji && matchesString(entry.romaji, filterText) ||
           entry.meanings && entry.meanings.some(m => matchesString(m, filterText));
}

const matchesString = (hayStack: string, needle: string) => {
    if (hayStack.indexOf('ō') >= 0)
        hayStack = hayStack.replaceAll("ō", "o");
    if (hayStack.indexOf('ū'))
        hayStack = hayStack.replaceAll('ū', 'u');

    return hayStack.toLowerCase().includes(needle.toLowerCase());
}

export default WordList;