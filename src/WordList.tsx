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
                    <tr>
                        <th>Kanji</th>
                        <th>Romaji</th>
                        <th>Betydelse</th>
                    </tr>
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
    const meanings = [];
    let index = 0;
    if (entry.meanings) {
        for (const meaning of entry.meanings) {
            if(meanings.length > 0)
                meanings.push(<br key={index++}/>);
            meanings.push(<span key={index++}>{meaning}</span>);
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