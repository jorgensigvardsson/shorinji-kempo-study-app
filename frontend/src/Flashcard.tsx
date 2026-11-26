import { useContext, useMemo } from "react";
import wordList from "./assets/word-list.json";
import FlashcardDeck, { type FlashcardDeckEntry } from "./components/FlashcardDeck";
import type { WordListEntry } from "./data";
import { TranslatorContext } from "./i18n";
import { practiceThemes } from "./practice-themes";

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
const footworkWordIds = new Set(practiceThemes.footwork.wordIds);
const flashcardDecks = {
    words: { title: "Ordlista", description: "Öva ord och betydelser.", words: wordFlashcards },
    footwork: {
        title: "Fotförflyttningar",
        description: "Öva namn och betydelser för fotförflyttningar.",
        words: wordFlashcards.filter(word => footworkWordIds.has(word.id)),
    },
    commands: {
        title: practiceThemes.commands.title,
        description: practiceThemes.commands.description,
        words: wordFlashcards.filter(word => practiceThemes.commands.wordIds.includes(word.id)),
    },
    body: {
        title: practiceThemes.body.title,
        description: practiceThemes.body.description,
        words: wordFlashcards.filter(word => practiceThemes.body.wordIds.includes(word.id)),
    },
};

const Flashcard = ({ deck = "words" }: { deck?: keyof typeof flashcardDecks }) => {
    const translator = useContext(TranslatorContext);
    const selection = flashcardDecks[deck];
    const isThemed = deck === "commands" || deck === "body";
    const cards = useMemo<FlashcardDeckEntry[]>(() => selection.words.map(card => {
        const kanji = card.kanji ?? card.romaji;
        const primaryMeaning = translator.translate(card.meanings[0]);
        const extraMeanings = card.meanings.slice(1).map(meaning => translator.translate(meaning));
        return {
            // Word ids already exist in synced documents and must keep their old keys.
            id: String(card.id),
            indexLabel: `#${card.id}`,
            front: isThemed ? (
                <>
                    <h2 className="flashcard-romaji">{card.romaji}</h2>
                    {card.kanji && <p className="flashcard-example">{card.kanji}</p>}
                </>
            ) : (
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
    }), [translator, selection, isThemed]);

    return <div className="flashcard-view study-session">
        <header className="study-page-header">
            <h1 className="app-page-heading">{translator.translate(selection.title)}</h1>
            <p className="app-intro-copy">{translator.translate(selection.description)}</p>
        </header>
        <FlashcardDeck key={deck} cards={cards} swipeOnly hideFaceLabels hideFlipHints hideIndexLabel={deck !== "words"} />
    </div>;
};

export default Flashcard;
