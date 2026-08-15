import type { WordListEntry } from "./data";
import wordListData from "./assets/word-list.json";
import { normalizeString } from "./strings";
import { cleanLookupTerm } from "./lookup-text";
import type { Translator } from "./i18n";

// Importing this module pulls in the word list, so it is loaded on demand rather
// than at startup. See components/SelectionWordLookup.tsx.
const wordList = wordListData as WordListEntry[];

const normalizeLookupTerm = (value: string): string => normalizeString(cleanLookupTerm(value));

const directEntryAliases = (entry: WordListEntry): string[] => {
    if (!entry.romaji) return [];
    const romaji = normalizeLookupTerm(entry.romaji);
    return [...new Set([
        romaji,
        ...romaji.split(/\s*\/\s*/),
    ].filter(Boolean))];
};

const tokenEntryAliases = (entry: WordListEntry): string[] => entry.romaji
    ? normalizeLookupTerm(entry.romaji).split(/[\s/]+/).filter(Boolean)
    : [];

const exactEntries = (query: string, translator: Translator): WordListEntry[] => wordList
    .map((entry, index) => {
        let score = 0;
        if (directEntryAliases(entry).includes(query)) score = 4;
        else if (entry.kanji && cleanLookupTerm(entry.kanji) === cleanLookupTerm(query)) score = 4;
        else if (entry.meanings?.some(meaning => normalizeLookupTerm(translator.translate(meaning)) === query)) score = 3;
        else if (tokenEntryAliases(entry).includes(query)) score = 1;
        return { entry, index, score };
    })
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(candidate => candidate.entry);

interface LookupTextAtOffset {
    text: string;
    start: number;
    end: number;
}

interface TextSegment {
    text: string;
    start: number;
    end: number;
}

const lookupTextSegments = (text: string): TextSegment[] => [...text.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu)]
    .map(match => ({
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
    }));

export const findLookupTextAtOffset = (text: string, offset: number, translator: Translator): LookupTextAtOffset | null => {
    const segments = lookupTextSegments(text);
    const touchedIndex = segments.findIndex(segment => offset >= segment.start && offset <= segment.end);
    if (touchedIndex < 0) return null;

    const phraseCandidates: Array<LookupTextAtOffset & { wordCount: number }> = [];
    for (let startIndex = Math.max(0, touchedIndex - 4); startIndex <= touchedIndex; startIndex += 1) {
        for (let endIndex = touchedIndex; endIndex < Math.min(segments.length, startIndex + 5); endIndex += 1) {
            if (startIndex === endIndex) continue;
            const phraseSegments = segments.slice(startIndex, endIndex + 1);
            phraseCandidates.push({
                text: phraseSegments.map(segment => segment.text).join(" "),
                start: phraseSegments[0].start,
                end: phraseSegments[phraseSegments.length - 1].end,
                wordCount: phraseSegments.length,
            });
        }
    }

    phraseCandidates.sort((left, right) => right.wordCount - left.wordCount || left.start - right.start);
    const phrase = phraseCandidates.find(candidate => exactEntries(normalizeLookupTerm(candidate.text), translator).length > 0);
    if (phrase) return { text: phrase.text, start: phrase.start, end: phrase.end };

    const touched = segments[touchedIndex];
    return { text: touched.text, start: touched.start, end: touched.end };
};

export const lookupWordEntries = (value: string, translator: Translator): WordListEntry[] => {
    const query = normalizeLookupTerm(value);
    if (!query) return [];

    const exact = exactEntries(query, translator);
    if (exact.length > 0) return exact.slice(0, 5);

    const tokens = [...new Set(query.split(/[\s&,/–—-]+/).filter(token => token.length > 1))];
    if (tokens.length <= 1) return [];

    const matches = tokens.flatMap(token => exactEntries(token, translator));
    return [...matches.reduce((unique, entry) => {
        if (!unique.has(entry.index)) unique.set(entry.index, entry);
        return unique;
    }, new Map<number, WordListEntry>()).values()].slice(0, 5);
};
