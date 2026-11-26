import { useContext, useMemo } from "react";
import type { CurrentGrade } from "./data";
import { noTranslate, TranslatorContext } from "./i18n";
import { useBrowserState } from "./browser-state";
import FlashcardDeck, { type FlashcardDeckEntry } from "./components/FlashcardDeck";
import { FocusChoicePicker } from "./components/TrainingPageControls";
import { defaultKamaeSelection, isKamaeSelection, kamaeFlashcards, type KamaeSelection } from "./kamae-flashcards";

export default function KamaeFlashcard({ currentGrade }: { currentGrade: CurrentGrade }) {
    const translator = useContext(TranslatorContext);
    const [selection, setSelection] = useBrowserState(
        `kamae-flashcards:${currentGrade}`, defaultKamaeSelection(currentGrade), isKamaeSelection);
    const cards = useMemo<FlashcardDeckEntry[]>(() => kamaeFlashcards
        .filter(card => selection === "all" || card.kyu)
        .map(({ node, family }) => ({
            // Kihon explanations differ from some older dictionary meanings.
            // Keep these learning marks separate from word and Hokei cards.
            id: `kamae:${node.id}`,
            front: <>
                <h2 className="flashcard-kanji">{noTranslate(node.kanji)}</h2>
                {!translator.isJapanese && <p className="flashcard-romaji">{noTranslate(node.name)}</p>}
            </>,
            back: <div className="kamae-flashcard-back">
                <div className="kamae-flashcard-explanation">
                    <h2 className="flashcard-meaning">{node.description && translator.translate(node.description)}</h2>
                    {node.alsoKnownAs && <p className="flashcard-example">
                        {translator.translate("Även kallad")} {noTranslate(translator.isJapanese ? node.alsoKnownAs.kanji : node.alsoKnownAs.name)}
                        {!translator.isJapanese && <span className="ms-2">{noTranslate(node.alsoKnownAs.kanji)}</span>}
                    </p>}
                </div>
                <p className="kamae-flashcard-family">
                    {translator.translate("Tillhör gruppen")} {" "}
                    {noTranslate(translator.isJapanese ? family.kanji : family.name)}
                    {!translator.isJapanese && <span className="ms-2">{noTranslate(family.kanji)}</span>}
                </p>
            </div>,
            learnedLabel: <>
                <span className="fw-semibold">{noTranslate(node.kanji)}</span>
                {!translator.isJapanese && <span className="text-muted ms-2 small">{noTranslate(node.name)}</span>}
            </>,
        })), [selection, translator]);
    return <div className="kamae-flashcard-view study-session">
        <header className="study-page-header">
            <h1 className="app-page-heading">{translator.translate("Kamae")}</h1>
            <p className="app-intro-copy">{translator.translate("Öva olika kamae.")}</p>
        </header>
        <div className="kamae-flashcard-filter">
            <FocusChoicePicker
                title={translator.translate("Välj vad du vill träna")}
                value={selection}
                choices={[
                    { value: "kyu", label: translator.translate("Kyū-urval · {0} kort", { params: [String(kamaeFlashcards.filter(card => card.kyu).length)] }) },
                    { value: "all", label: translator.translate("Alla kamae · {0} kort", { params: [String(kamaeFlashcards.length)] }) },
                ]}
                onChange={value => setSelection(value as KamaeSelection)}
            />
        </div>
        <FlashcardDeck key={`${currentGrade}:${selection}`} cards={cards} swipeOnly hideFaceLabels hideFlipHints hideIndexLabel />
    </div>;
}
