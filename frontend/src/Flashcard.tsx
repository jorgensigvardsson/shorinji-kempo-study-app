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

const Flashcard = () => {
    const translator = useContext(TranslatorContext);
    const cards = useMemo<FlashcardDeckEntry[]>(() => wordFlashcards.map(card => {
        const kanji = card.kanji ?? card.romaji;
        const primaryMeaning = translator.translate(card.meanings[0]);
        const extraMeanings = card.meanings.slice(1).map(meaning => translator.translate(meaning));
        return {
            // Word ids already exist in synced documents and must keep their old keys.
            id: String(card.id),
            indexLabel: `#${card.id}`,
            front: (
                <>
                    <h1 className="flashcard-kanji">{kanji}</h1>
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
    }), [translator]);

    return <FlashcardDeck cards={cards} />;
};

export default Flashcard;
