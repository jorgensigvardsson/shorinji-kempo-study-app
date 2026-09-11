import { useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Badge, Button, Card, Form, Modal } from "react-bootstrap";
import { ArrowLeft, CheckCircleFill } from "react-bootstrap-icons";
import { TranslatorContext, type Translator } from "../i18n";
import { getAppDataStore } from "../persistence/store";
import type { FlashCardKnownEntry } from "../persistence/schema";
import "../Flashcard.css";

export interface FlashcardDeckEntry {
    id: string;
    indexLabel?: ReactNode;
    front: ReactNode;
    back: ReactNode;
    learnedLabel: ReactNode;
    interactiveBack?: boolean;
}

interface Props {
    cards: FlashcardDeckEntry[];
    swipeOnly?: boolean;
}

const SWIPE_THRESHOLD = 80;
type PendingAction = "none" | "known" | "next";

const actionForSwipe = (dx: number, dy: number, swipeOnly: boolean): PendingAction => {
    if (Math.sqrt(dx * dx + dy * dy) < SWIPE_THRESHOLD) return "none";
    if (swipeOnly) {
        if (Math.abs(dy) >= Math.abs(dx)) return "none";
        return dx > 0 ? "known" : "next";
    }
    return Math.abs(dy) > Math.abs(dx) ? "known" : "next";
};

const pickRandom = (cards: FlashcardDeckEntry[], excludeId?: string): string | null => {
    if (cards.length === 0) return null;
    const eligible = excludeId !== undefined && cards.length > 1
        ? cards.filter(card => card.id !== excludeId)
        : cards;
    return eligible[Math.floor(Math.random() * eligible.length)].id;
};

const isInteractiveTarget = (target: EventTarget | null): boolean =>
    target instanceof Element
    && target.closest("button, input, textarea, select, a, label, [contenteditable='true']") !== null;

const FlashcardDeck = ({ cards, swipeOnly = false }: Props) => {
    const translator = useContext(TranslatorContext);
    const store = getAppDataStore();
    const [knownFlashCards, setKnownFlashCards] = useState<Record<string, FlashCardKnownEntry>>(
        () => store.get("knownFlashCards"),
    );
    const knownFlashCardsRef = useRef(knownFlashCards);
    useEffect(() => { knownFlashCardsRef.current = knownFlashCards; }, [knownFlashCards]);
    useEffect(
        () => store.subscribe("knownFlashCards", entries => setKnownFlashCards(entries)),
        [store],
    );

    const knownIds = useMemo(
        () => new Set(Object.entries(knownFlashCards).filter(([, entry]) => entry.known).map(([id]) => id)),
        [knownFlashCards],
    );
    const availableCards = useMemo(
        () => cards.filter(card => !knownIds.has(card.id)),
        [cards, knownIds],
    );
    const [currentCardId, setCurrentCardId] = useState<string | null>(() =>
        pickRandom(cards.filter(card => !store.get("knownFlashCards")[card.id]?.known)),
    );
    const [showBack, setShowBack] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [isFlying, setIsFlying] = useState(false);
    const [pendingAction, setPendingAction] = useState<PendingAction>("none");
    const [showLearnedModal, setShowLearnedModal] = useState(false);
    const [selectedForRemoval, setSelectedForRemoval] = useState<Set<string>>(new Set());
    const dragStartRef = useRef<{ x: number; y: number } | null>(null);
    const hasDraggedRef = useRef(false);

    const effectiveCurrentCardId = currentCardId !== null
        && availableCards.some(card => card.id === currentCardId)
        ? currentCardId
        : availableCards[0]?.id ?? null;
    const currentCard = cards.find(card => card.id === effectiveCurrentCardId) ?? null;

    const resetMotion = () => {
        setIsFlying(false);
        setIsDragging(false);
        setDragOffset({ x: 0, y: 0 });
        setPendingAction("none");
    };

    const commitMarkKnown = (cardId: string) => {
        const updated = {
            ...knownFlashCardsRef.current,
            [cardId]: { known: true, updatedAt: new Date().toISOString() },
        };
        setKnownFlashCards(updated);
        knownFlashCardsRef.current = updated;
        store.set("knownFlashCards", updated);
        resetMotion();
        setCurrentCardId(pickRandom(cards.filter(card => !updated[card.id]?.known), cardId));
        setShowBack(false);
    };

    const commitNextCard = (cardId: string) => {
        resetMotion();
        setCurrentCardId(pickRandom(cards.filter(card => !knownFlashCardsRef.current[card.id]?.known), cardId));
        setShowBack(false);
    };

    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (isFlying || isInteractiveTarget(event.target)) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragStartRef.current = { x: event.clientX, y: event.clientY };
        hasDraggedRef.current = false;
    };

    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!dragStartRef.current || isFlying) return;
        const dx = event.clientX - dragStartRef.current.x;
        const dy = event.clientY - dragStartRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) <= 5) return;
        hasDraggedRef.current = true;
        if (swipeOnly && Math.abs(dy) >= Math.abs(dx)) return;
        setIsDragging(true);
        setDragOffset({ x: dx, y: dy });
        setPendingAction(actionForSwipe(dx, dy, swipeOnly));
    };

    const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
        if (!dragStartRef.current) return;
        const dx = event.clientX - dragStartRef.current.x;
        const dy = event.clientY - dragStartRef.current.y;
        dragStartRef.current = null;

        if (!hasDraggedRef.current) {
            setIsDragging(false);
            setPendingAction("none");
            if (!isFlying) setShowBack(value => !value);
            return;
        }

        setIsDragging(false);
        const action = actionForSwipe(dx, dy, swipeOnly);
        if (action !== "none" && currentCard) {
            setDragOffset({ x: dx * 8, y: dy * 8 });
            setIsFlying(true);
            const cardId = currentCard.id;
            window.setTimeout(
                () => action === "known" ? commitMarkKnown(cardId) : commitNextCard(cardId),
                400,
            );
            return;
        }

        setDragOffset({ x: 0, y: 0 });
        setPendingAction("none");
    };

    const handlePointerCancel = () => {
        dragStartRef.current = null;
        hasDraggedRef.current = false;
        resetMotion();
    };

    const markCurrentKnown = () => {
        if (currentCard && !isFlying) commitMarkKnown(currentCard.id);
    };

    const showNextCard = () => {
        if (isFlying) return;
        setCurrentCardId(pickRandom(availableCards, currentCard?.id));
        setShowBack(false);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!swipeOnly || isInteractiveTarget(event.target)) return;
        if (event.key === "ArrowRight") {
            event.preventDefault();
            markCurrentKnown();
        } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            showNextCard();
        }
    };

    const toggleSelected = (id: string) => {
        setSelectedForRemoval(previous => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const updateDeckKnownState = (ids: Iterable<string>, known: boolean) => {
        const updated = { ...knownFlashCardsRef.current };
        const now = new Date().toISOString();
        for (const id of ids) updated[id] = { known, updatedAt: now };
        knownFlashCardsRef.current = updated;
        setKnownFlashCards(updated);
        store.set("knownFlashCards", updated);
    };

    const removeSelectedFromKnown = () => {
        updateDeckKnownState(selectedForRemoval, false);
        setSelectedForRemoval(new Set());
    };

    const clearAllKnown = () => {
        const learnedIds = cards
            .filter(card => knownFlashCardsRef.current[card.id]?.known)
            .map(card => card.id);
        updateDeckKnownState(learnedIds, false);
        setSelectedForRemoval(new Set());
        setCurrentCardId(pickRandom(cards));
        setShowBack(false);
    };

    const closeModal = () => {
        setShowLearnedModal(false);
        setSelectedForRemoval(new Set());
    };

    const learnedCards = cards.filter(card => knownIds.has(card.id));
    const learnedButton = (
        <Button variant="outline-secondary" onClick={() => setShowLearnedModal(true)}>
            {translator.translate("Inlärda kort")}
            {learnedCards.length > 0 && <Badge bg="secondary" className="ms-2">{learnedCards.length}</Badge>}
        </Button>
    );
    const learnedModal = (
        <LearnedCardsModal
            show={showLearnedModal}
            onHide={closeModal}
            learnedCards={learnedCards}
            selectedIds={selectedForRemoval}
            translator={translator}
            onToggleSelect={toggleSelected}
            onRemoveSelected={removeSelectedFromKnown}
            onClearAll={clearAllKnown}
        />
    );

    if (cards.length === 0) {
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

    if (availableCards.length === 0 || currentCard === null) {
        return (
            <div className="flashcard-page">
                <Card className="flashcard-card shadow-sm">
                    <Card.Body className="flashcard-body">
                        <div className="flashcard-main">
                            <h2 className="flashcard-meaning text-center mb-0">{translator.translate("Alla kort klara!")}</h2>
                        </div>
                        <div className="text-center">
                            <Button variant="primary" onClick={clearAllKnown}>{translator.translate("Börja om")}</Button>
                        </div>
                    </Card.Body>
                </Card>
                <div className="flashcard-actions">{learnedButton}</div>
                {learnedModal}
            </div>
        );
    }

    const dragStyle: CSSProperties = isDragging || isFlying ? {
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) rotate(${dragOffset.x * 0.04}deg)`,
        transition: isFlying ? "transform 0.4s ease, opacity 0.4s ease" : "none",
        opacity: isFlying ? 0 : 1,
    } : {};

    return (
        <div className="flashcard-page">
            <div
                className={`flashcard-drag-wrapper ${swipeOnly ? "is-horizontal-swipe" : ""}`}
                style={dragStyle}
                role={swipeOnly ? "group" : undefined}
                tabIndex={swipeOnly ? 0 : undefined}
                aria-label={swipeOnly ? translator.translate("Svep vänster för att öva igen eller höger om du kan det.") : undefined}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onKeyDown={handleKeyDown}
            >
                <div className={`flashcard-scene ${showBack ? "is-flipped" : ""}`}>
                    <div className="flashcard-inner">
                        <FlashcardFace
                            side="front"
                            sideLabel={translator.translate("Framsida")}
                            indexLabel={currentCard.indexLabel}
                            hint={translator.translate("Tryck för att vända")}
                        >
                            {currentCard.front}
                        </FlashcardFace>
                        <FlashcardFace
                            side="back"
                            sideLabel={translator.translate("Baksida")}
                            indexLabel={currentCard.indexLabel}
                            hint={translator.translate("Tryck för att vända tillbaka")}
                            interactive={currentCard.interactiveBack}
                        >
                            {currentCard.back}
                        </FlashcardFace>
                    </div>
                </div>
                {isDragging && pendingAction !== "none" && (
                    <div className={`flashcard-swipe-indicator is-${pendingAction}`}>
                        <span className="flashcard-swipe-indicator-icon">
                            {pendingAction === "known" ? <CheckCircleFill /> : <ArrowLeft />}
                        </span>
                    </div>
                )}
            </div>
            {swipeOnly ? (
                <div className="flashcard-swipe-guide">
                    <span>← {translator.translate("Öva igen")}</span>
                    <span className="flashcard-swipe-guide-center">{translator.translate("Svep kortet")}</span>
                    <span>{translator.translate("Kan det")} →</span>
                </div>
            ) : (
                <div className="flashcard-actions">
                    <Button variant="success" onClick={markCurrentKnown} disabled={isFlying}>
                        {translator.translate("Kan det")}
                    </Button>
                    <Button variant="primary" onClick={showNextCard} disabled={isFlying}>
                        {translator.translate("Nästa kort")}
                    </Button>
                    {learnedButton}
                </div>
            )}
            {learnedModal}
        </div>
    );
};

const FlashcardFace = ({
    side,
    sideLabel,
    indexLabel,
    hint,
    interactive = false,
    children,
}: {
    side: "front" | "back";
    sideLabel: string;
    indexLabel?: ReactNode;
    hint: string;
    interactive?: boolean;
    children: ReactNode;
}) => (
    <div className={`flashcard-face flashcard-${side}`}>
        <Card className="flashcard-card shadow-sm">
            <Card.Body className="flashcard-body">
                <div className="flashcard-meta">
                    <span className="flashcard-index">{indexLabel}</span>
                    <span className="flashcard-side-label">{sideLabel}</span>
                </div>
                <div className={`flashcard-main ${interactive ? "flashcard-main-interactive" : ""}`}>
                    {children}
                </div>
                <p className="flashcard-hint">{hint}</p>
            </Card.Body>
        </Card>
    </div>
);

const LearnedCardsModal = ({
    show,
    onHide,
    learnedCards,
    selectedIds,
    translator,
    onToggleSelect,
    onRemoveSelected,
    onClearAll,
}: {
    show: boolean;
    onHide: () => void;
    learnedCards: FlashcardDeckEntry[];
    selectedIds: Set<string>;
    translator: Translator;
    onToggleSelect: (id: string) => void;
    onRemoveSelected: () => void;
    onClearAll: () => void;
}) => (
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
                        <Button variant="outline-danger" size="sm" onClick={onClearAll}>
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
                        {learnedCards.map(card => {
                            const inputId = `learned-${encodeURIComponent(card.id)}`;
                            return (
                                <li key={card.id} className="flashcard-learned-item">
                                    <Form.Check
                                        type="checkbox"
                                        id={inputId}
                                        checked={selectedIds.has(card.id)}
                                        onChange={() => onToggleSelect(card.id)}
                                    />
                                    <label htmlFor={inputId} className="flashcard-learned-label">
                                        {card.learnedLabel}
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </Modal.Body>
    </Modal>
);

export default FlashcardDeck;
