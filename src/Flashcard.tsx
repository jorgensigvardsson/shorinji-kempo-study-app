import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Form, Modal } from "react-bootstrap";
import { TranslatorContext, type Translator } from "./i18n";
import type { WordListEntry } from "./data";
import { getAppDataStore } from "./persistence/store";
import type { FlashCardKnownEntry } from "./persistence/schema";
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

const SWIPE_THRESHOLD = 80;

function pickRandom(cards: FlashCardEntry[], excludeId?: number): number | null {
    if (cards.length === 0) return null;
    const eligible = excludeId !== undefined && cards.length > 1
        ? cards.filter(c => c.id !== excludeId)
        : cards;
    return eligible[Math.floor(Math.random() * eligible.length)].id;
}

const Flashcard = () => {
    const translator = useContext(TranslatorContext);
    const store = getAppDataStore();

    const [knownFlashCards, setKnownFlashCards] = useState<Record<string, FlashCardKnownEntry>>(() =>
        store.get("knownFlashCards"));

    const knownFlashCardsRef = useRef(knownFlashCards);
    useEffect(() => { knownFlashCardsRef.current = knownFlashCards; }, [knownFlashCards]);

    useEffect(() => store.subscribe("knownFlashCards", entries =>
        setKnownFlashCards(entries)), []);

    const knownIds = useMemo(() =>
        new Set(Object.entries(knownFlashCards).filter(([, e]) => e.known).map(([id]) => id)),
        [knownFlashCards]);

    const availableCards = useMemo(() =>
        flashCards.filter(c => !knownIds.has(String(c.id))), [knownIds]);

    const [currentCardId, setCurrentCardId] = useState<number | null>(() => {
        const initial = store.get("knownFlashCards");
        return pickRandom(flashCards.filter(c => !initial[String(c.id)]?.known));
    });

    const [showBack, setShowBack] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [isFlying, setIsFlying] = useState(false);
    const [showLearnedModal, setShowLearnedModal] = useState(false);
    const [selectedForRemoval, setSelectedForRemoval] = useState<Set<string>>(new Set());

    const dragStartRef = useRef<{ x: number; y: number } | null>(null);
    const hasDraggedRef = useRef(false);

    // If the current card is removed from available by an external sync, pick a new one
    useEffect(() => {
        if (isFlying) return;
        if (currentCardId === null || availableCards.some(c => c.id === currentCardId)) return;
        setCurrentCardId(pickRandom(availableCards));
        setShowBack(false);
    }, [availableCards, currentCardId, isFlying]);

    const currentCard = useMemo(() =>
        flashCards.find(c => c.id === currentCardId) ?? null, [currentCardId]);

    const commitMarkKnown = (cardId: number) => {
        const now = new Date().toISOString();
        const updated = { ...knownFlashCardsRef.current, [String(cardId)]: { known: true, updatedAt: now } };
        setKnownFlashCards(updated);
        store.set("knownFlashCards", updated);
        setIsFlying(false);
        setIsDragging(false);
        setDragOffset({ x: 0, y: 0 });
        setCurrentCardId(pickRandom(flashCards.filter(c => !updated[String(c.id)]?.known), cardId));
        setShowBack(false);
    };

    const handleMarkKnownButton = () => {
        if (!currentCard || isFlying) return;
        commitMarkKnown(currentCard.id);
    };

    const handleNextCard = () => {
        if (isFlying) return;
        setCurrentCardId(pickRandom(availableCards, currentCard?.id));
        setShowBack(false);
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (isFlying) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        hasDraggedRef.current = false;
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragStartRef.current || isFlying) return;
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
            hasDraggedRef.current = true;
            setIsDragging(true);
            setDragOffset({ x: dx, y: dy });
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragStartRef.current) return;
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        dragStartRef.current = null;

        if (!hasDraggedRef.current) {
            setIsDragging(false);
            if (!isFlying) setShowBack(b => !b);
            return;
        }

        setIsDragging(false);

        if (dist >= SWIPE_THRESHOLD && currentCard) {
            setDragOffset({ x: dx * 8, y: dy * 8 });
            setIsFlying(true);
            const cardId = currentCard.id;
            setTimeout(() => commitMarkKnown(cardId), 400);
        } else {
            setDragOffset({ x: 0, y: 0 });
        }
    };

    const handlePointerCancel = () => {
        dragStartRef.current = null;
        hasDraggedRef.current = false;
        setIsDragging(false);
        setDragOffset({ x: 0, y: 0 });
    };

    const toggleSelectForRemoval = (id: string) => {
        setSelectedForRemoval(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const removeSelectedFromKnown = () => {
        const now = new Date().toISOString();
        const updated = { ...knownFlashCards };
        for (const id of selectedForRemoval) updated[id] = { known: false, updatedAt: now };
        setKnownFlashCards(updated);
        store.set("knownFlashCards", updated);
        setSelectedForRemoval(new Set());
    };

    const clearAllKnown = () => {
        const now = new Date().toISOString();
        const updated: Record<string, FlashCardKnownEntry> = {};
        for (const id of Object.keys(knownFlashCards)) updated[id] = { known: false, updatedAt: now };
        setKnownFlashCards(updated);
        store.set("knownFlashCards", updated);
        setSelectedForRemoval(new Set());
    };

    const closeModal = () => {
        setShowLearnedModal(false);
        setSelectedForRemoval(new Set());
    };

    const learnedCards = useMemo(() =>
        flashCards.filter(c => knownIds.has(String(c.id))), [knownIds]);

    const learnedButton = (
        <Button variant="outline-secondary" onClick={() => setShowLearnedModal(true)}>
            {translator.translate("Inlärda kort")}
            {knownIds.size > 0 && <Badge bg="secondary" className="ms-2">{knownIds.size}</Badge>}
        </Button>
    );

    const learnedModal = (
        <LearnedCardsModal
            show={showLearnedModal}
            onHide={closeModal}
            learnedCards={learnedCards}
            selectedIds={selectedForRemoval}
            translator={translator}
            onToggleSelect={toggleSelectForRemoval}
            onRemoveSelected={removeSelectedFromKnown}
            onClearAll={clearAllKnown}
        />
    );

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

    if (availableCards.length === 0) {
        return (
            <div className="flashcard-page">
                <Card className="flashcard-card shadow-sm">
                    <Card.Body className="flashcard-body">
                        <div className="flashcard-main">
                            <h2 className="flashcard-meaning text-center mb-0">{translator.translate("Alla kort klara!")}</h2>
                        </div>
                        <div className="text-center">
                            <Button variant="primary" onClick={clearAllKnown}>
                                {translator.translate("Börja om")}
                            </Button>
                        </div>
                    </Card.Body>
                </Card>
                <div className="flashcard-actions">{learnedButton}</div>
                {learnedModal}
            </div>
        );
    }

    const card = currentCard!;
    const kanji = card.kanji ?? card.romaji;
    const primaryMeaning = translator.translate(card.meanings[0]);
    const extraMeanings = card.meanings.slice(1).map(s => translator.translate(s));

    const dragStyle: React.CSSProperties = isDragging || isFlying ? {
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) rotate(${dragOffset.x * 0.04}deg)`,
        transition: isFlying ? "transform 0.4s ease, opacity 0.4s ease" : "none",
        opacity: isFlying ? 0 : 1,
    } : {};

    return (
        <div className="flashcard-page">
            <div
                className="flashcard-drag-wrapper"
                style={dragStyle}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
            >
                <div className={`flashcard-scene ${showBack ? "is-flipped" : ""}`}>
                    <div className="flashcard-inner">
                        <div className="flashcard-face flashcard-front">
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
                        <div className="flashcard-face flashcard-back">
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
            </div>

            <div className="flashcard-actions">
                <Button variant="success" onClick={handleMarkKnownButton} disabled={isFlying}>
                    {translator.translate("Kan det")}
                </Button>
                <Button variant="primary" onClick={handleNextCard} disabled={isFlying}>
                    {translator.translate("Nästa kort")}
                </Button>
                {learnedButton}
            </div>

            {learnedModal}
        </div>
    );
};

interface LearnedCardsModalProps {
    show: boolean;
    onHide: () => void;
    learnedCards: FlashCardEntry[];
    selectedIds: Set<string>;
    translator: Translator;
    onToggleSelect: (id: string) => void;
    onRemoveSelected: () => void;
    onClearAll: () => void;
}

const LearnedCardsModal = ({
    show, onHide, learnedCards, selectedIds, translator,
    onToggleSelect, onRemoveSelected, onClearAll,
}: LearnedCardsModalProps) => (
    <Modal show={show} onHide={onHide} scrollable>
        <Modal.Header closeButton>
            <Modal.Title>
                {translator.translate("Inlärda kort")}
                {learnedCards.length > 0 && <Badge bg="secondary" className="ms-2">{learnedCards.length}</Badge>}
            </Modal.Title>
        </Modal.Header>
        <Modal.Body>
            {learnedCards.length === 0 ? (
                <p className="text-muted mb-0">{translator.translate("Inga inlärda kort")}</p>
            ) : (
                <>
                    <div className="d-flex gap-2 mb-3">
                        <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={onClearAll}
                        >
                            {translator.translate("Rensa alla")}
                        </Button>
                        <Button
                            variant="outline-secondary"
                            size="sm"
                            disabled={selectedIds.size === 0}
                            onClick={onRemoveSelected}
                        >
                            {translator.translate("Ta bort markerade")}
                            {selectedIds.size > 0 && <Badge bg="secondary" className="ms-2">{selectedIds.size}</Badge>}
                        </Button>
                    </div>
                    <ul className="list-unstyled mb-0">
                        {learnedCards.map(card => (
                            <li key={card.id} className="flashcard-learned-item">
                                <Form.Check
                                    type="checkbox"
                                    id={`learned-${card.id}`}
                                    checked={selectedIds.has(String(card.id))}
                                    onChange={() => onToggleSelect(String(card.id))}
                                />
                                <label htmlFor={`learned-${card.id}`} className="flashcard-learned-label">
                                    <span className="fw-semibold">{card.kanji ?? card.romaji}</span>
                                    {card.kanji && <span className="text-muted ms-2 small">{card.romaji}</span>}
                                </label>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </Modal.Body>
    </Modal>
);

export default Flashcard;
