import { useContext, useMemo } from "react";
import wordList from "./assets/word-list.json";
import FlashcardDeck, { type FlashcardDeckEntry } from "./components/FlashcardDeck";
import type { WordListEntry } from "./data";
import { TranslatorContext } from "./i18n";

interface WordFlashcardEntry {
    id: number;
    kanji?: string;
    romaji: string;
    meanings: string[];
}

const hasFlashcardContent = (entry: WordListEntry): entry is WordListEntry & { romaji: string; meanings: string[] } =>
    !!entry.romaji && !!entry.meanings && entry.meanings.length > 0;

const wordFlashcards: WordFlashcardEntry[] = (wordList as WordListEntry[])
    .filter(hasFlashcardContent)
    .map(entry => ({
        id: entry.id,
        kanji: entry.kanji,
        romaji: entry.romaji,
        meanings: entry.meanings,
    }));

// These are existing word identities, shared with the full dictionary deck.
// Keep the selection explicit so unrelated future words never enter this deck.
const footworkWordIds = new Set([539, 540, 541, 542, 543, 544, 545, 546, 547]);
const flashcardDecks = {
    words: { title: "Ordlista", description: "Öva ord och betydelser.", words: wordFlashcards },
    footwork: {
        title: "Fotförflyttningar",
        description: "Öva namn och betydelser för fotförflyttningar.",
        words: wordFlashcards.filter(word => footworkWordIds.has(word.id)),
    },
};

const Flashcard = ({ deck = "words" }: { deck?: keyof typeof flashcardDecks }) => {
    const translator = useContext(TranslatorContext);
    const selection = flashcardDecks[deck];
    const cards = useMemo<FlashcardDeckEntry[]>(() => selection.words.map(card => {
        const kanji = card.kanji ?? card.romaji;
        const primaryMeaning = translator.translate(card.meanings[0]);
        const extraMeanings = card.meanings.slice(1).map(meaning => translator.translate(meaning));
        return {
            // Word ids already exist in synced documents and must keep their old keys.
            id: String(card.id),
            indexLabel: `#${card.id}`,
            front: (
                <>
                    <h2 className="flashcard-kanji">{kanji}</h2>
                    <p className="flashcard-romaji">{card.romaji}</p>
                </>
            ),
            back: (
                <>
                    <h2 className="flashcard-meaning">{primaryMeaning}</h2>
                    {extraMeanings.length > 0 && <p className="flashcard-example">{extraMeanings.join(", ")}</p>}
                </>
            ),
            learnedLabel: (
                <>
                    <span className="fw-semibold">{kanji}</span>
                    {card.kanji && <span className="text-muted ms-2 small">{card.romaji}</span>}
                </>
            ),
        };
    }), [translator, selection]);

    return <div className="flashcard-view study-session">
        <header className="study-page-header">
            <h1 className="app-page-heading">{translator.translate(selection.title)}</h1>
            <p className="app-intro-copy">{translator.translate(selection.description)}</p>
        </header>
        <FlashcardDeck key={deck} cards={cards} swipeOnly hideFaceLabels hideFlipHints hideIndexLabel={deck === "footwork"} />
    </div>;
};

export default Flashcard;
