import { useContext, useState } from "react";
import { Button, Card } from "react-bootstrap";
import { TranslatorContext } from "./i18n";
import type { WordListEntry } from "./data";
import wordList from "./assets/word-list.json";
import "./Flashcard.css";

interface FlashCardEntry {
    id: number;
    kanji?: string;
    romaji: string;
    meanings: string[];
}

const hasFlashCardContent = (entry: WordListEntry): entry is WordListEntry & { romaji: string; meanings: string[] } => {
    return !!entry.romaji && !!entry.meanings && entry.meanings.length > 0;
}

const flashCards: FlashCardEntry[] = (wordList as WordListEntry[])
    .filter(hasFlashCardContent)
    .map(entry => ({
        id: entry.index + 1,
        kanji: entry.kanji,
        romaji: entry.romaji,
        meanings: entry.meanings
    }));

const Flashcard = () => {
    const translator = useContext(TranslatorContext);
    const [cardIndex, setCardIndex] = useState(() =>
        flashCards.length > 0 ? Math.floor(Math.random() * flashCards.length) : 0
    );
    const [showBack, setShowBack] = useState(false);

    if (flashCards.length === 0) {
        return (
            <div className="flashcard-page">
                <Card className="flashcard-card shadow-sm">
                    <Card.Body className="flashcard-body">
                        <h2 className="flashcard-meaning text-center mb-0">{translator.translate("Inga flashkort tillgängliga")}</h2>
                    </Card.Body>
                </Card>
            </div>
        );
    }

    const card = flashCards[cardIndex];
    const kanji = card.kanji ?? card.romaji;
    const primaryMeaning = translator.translate(card.meanings[0]);
    const extraMeanings = card.meanings.slice(1).map(s => translator.translate(s));

    const nextCard = () => {
        let nextIndex = cardIndex;

        if (flashCards.length > 1) {
            while (nextIndex === cardIndex) {
                nextIndex = Math.floor(Math.random() * flashCards.length);
            }
        }

        setCardIndex(nextIndex);
        setShowBack(false);
    };

    return (
        <div className="flashcard-page">
            <div className={`flashcard-scene ${showBack ? "is-flipped" : ""}`}>
                <div className="flashcard-inner">
                    <div className="flashcard-face flashcard-front" onClick={() => setShowBack(true)}>
                        <Card className="flashcard-card shadow-sm">
                            <Card.Body className="flashcard-body">
                                <div className="flashcard-meta">
                                    <span className="flashcard-index">#{card.id}</span>
                                    <span className="flashcard-side-label">{translator.translate("Framsida")}</span>
                                </div>

                                <div className="flashcard-main">
                                    <h1 className="flashcard-kanji">{kanji}</h1>
                                    <p className="flashcard-romaji">{card.romaji}</p>
                                </div>

                                <p className="flashcard-hint">{translator.translate("Tryck för att vända")}</p>
                            </Card.Body>
                        </Card>
                    </div>

                    <div className="flashcard-face flashcard-back" onClick={() => setShowBack(false)}>
                        <Card className="flashcard-card shadow-sm">
                            <Card.Body className="flashcard-body">
                                <div className="flashcard-meta">
                                    <span className="flashcard-index">#{card.id}</span>
                                    <span className="flashcard-side-label">{translator.translate("Baksida")}</span>
                                </div>

                                <div className="flashcard-main">
                                    <h2 className="flashcard-meaning">{primaryMeaning}</h2>
                                    {extraMeanings.length > 0 && <p className="flashcard-example">{extraMeanings.join(", ")}</p>}
                                </div>

                                <p className="flashcard-hint">{translator.translate("Tryck för att vända tillbaka")}</p>
                            </Card.Body>
                        </Card>
                    </div>
                </div>
            </div>

            <div className="flashcard-actions">
                <Button variant="primary" onClick={nextCard}>
                    {translator.translate("Nästa kort")}
                </Button>
            </div>
        </div>
    );
};

export default Flashcard;
