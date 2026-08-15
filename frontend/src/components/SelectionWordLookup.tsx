import { useContext, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "react-bootstrap-icons";
import type { WordListEntry } from "../data";
import { TranslatorContext } from "../i18n";
import { logMissingWordLookup } from "../missing-word-lookups";
import { cleanLookupTerm, isUsefulLookupSelection } from "../lookup-text";
import "./SelectionWordLookup.css";

// The word list is a large file that nothing needs until someone actually looks a
// word up, so it is fetched on demand instead of at startup. It is warmed once this
// component mounts and again on every touch that might become a long press, so by
// the time a lookup is wanted it is normally already in hand.
//
// `loadedWordLookup` is the resolved module, kept separately so the long-press path
// can stay synchronous: a gesture handler that awaits would set its "this press
// opened a lookup" flag after the finger had already lifted, and the tap it is
// meant to swallow would go through to whatever was underneath.
type WordLookup = typeof import("../word-lookup");
let wordLookupModule: Promise<WordLookup> | null = null;
let loadedWordLookup: WordLookup | null = null;
const loadWordLookup = () => (wordLookupModule ??= import("../word-lookup").then(module => {
    loadedWordLookup = module;
    return module;
}));

interface LookupPosition {
    left: number;
    top?: number;
    bottom?: number;
}

interface SelectionCandidate {
    text: string;
    position: LookupPosition;
}

interface LookupResult extends SelectionCandidate {
    entries: WordListEntry[];
}

interface PendingLongPress {
    pointerId: number;
    startX: number;
    startY: number;
    target: Element;
    selectionBlocker: Element;
    timer: number;
    triggered: boolean;
}

interface SuppressedClick {
    target: Element;
    expiresAt: number;
}

const LONG_PRESS_DELAY = 525;
const LONG_PRESS_MOVE_LIMIT = 10;

const positionNearRange = (range: Range, width: number): LookupPosition => {
    const rects = range.getClientRects();
    const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
    const left = Math.max(width / 2 + 12, Math.min(window.innerWidth - width / 2 - 12, rect.left + rect.width / 2));
    if (rect.bottom < window.innerHeight * 0.62) return { left, top: rect.bottom + 8 };
    return { left, bottom: window.innerHeight - rect.top + 8 };
};

const selectionIsEditable = (selection: Selection): boolean => {
    const node = selection.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    return !!element?.closest("input, textarea, select, [contenteditable='true'], .selection-word-lookup");
};

const longPressIsDisabled = (target: Element): boolean => !!target.closest(
    "input, textarea, select, button, a, [contenteditable='true'], [data-word-lookup-disabled], .selection-word-lookup",
);

const textPositionAtPoint = (x: number, y: number): { node: Text; offset: number } | null => {
    const caretPosition = typeof document.caretPositionFromPoint === "function"
        ? document.caretPositionFromPoint(x, y)
        : null;
    if (caretPosition?.offsetNode.nodeType === Node.TEXT_NODE) {
        return { node: caretPosition.offsetNode as Text, offset: caretPosition.offset };
    }

    const range = typeof document.caretRangeFromPoint === "function"
        ? document.caretRangeFromPoint(x, y)
        : null;
    if (range?.startContainer.nodeType === Node.TEXT_NODE) {
        return { node: range.startContainer as Text, offset: range.startOffset };
    }
    return null;
};

const positionNearPoint = (x: number, y: number): LookupPosition => {
    const left = positionForCard(x);
    if (y < window.innerHeight * 0.62) return { left, top: y + 12 };
    return { left, bottom: window.innerHeight - y + 12 };
};

const targetsOverlap = (left: Element, right: Element): boolean => left === right || left.contains(right) || right.contains(left);

const SelectionWordLookup = () => {
    const translator = useContext(TranslatorContext);
    const [candidate, setCandidate] = useState<SelectionCandidate | null>(null);
    const [result, setResult] = useState<LookupResult | null>(null);
    const resultRef = useRef<HTMLDivElement>(null);
    const pendingLongPressRef = useRef<PendingLongPress | null>(null);
    const suppressedClickRef = useRef<SuppressedClick | null>(null);

    // Fetch the word list once the page has settled, so a lookup does not have to wait
    // for it but the first paint does not either. requestIdleCallback is missing in
    // Safari, hence the timer.
    useEffect(() => {
        const idle = window.requestIdleCallback;
        if (idle) {
            const handle = idle(() => void loadWordLookup(), { timeout: 5000 });
            return () => window.cancelIdleCallback(handle);
        }
        const timer = window.setTimeout(() => void loadWordLookup(), 2000);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        const readSelection = () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || selection.isCollapsed || selectionIsEditable(selection)) {
                setCandidate(null);
                return;
            }
            const text = cleanLookupTerm(selection.toString());
            if (!isUsefulLookupSelection(text)) {
                setCandidate(null);
                return;
            }
            setCandidate({ text, position: positionNearRange(selection.getRangeAt(0), 4.5 * 16) });
        };
        const readTouchSelection = () => window.setTimeout(readSelection, 30);
        const hideCandidate = () => setCandidate(null);
        const hideCollapsedSelection = () => {
            if (window.getSelection()?.isCollapsed) hideCandidate();
        };

        document.addEventListener("mouseup", readSelection);
        document.addEventListener("touchend", readTouchSelection);
        document.addEventListener("keyup", readSelection);
        document.addEventListener("selectionchange", hideCollapsedSelection);
        window.addEventListener("scroll", hideCandidate, true);
        return () => {
            document.removeEventListener("mouseup", readSelection);
            document.removeEventListener("touchend", readTouchSelection);
            document.removeEventListener("keyup", readSelection);
            document.removeEventListener("selectionchange", hideCollapsedSelection);
            window.removeEventListener("scroll", hideCandidate, true);
        };
    }, []);

    useEffect(() => {
        const finishPendingPress = () => {
            const pending = pendingLongPressRef.current;
            if (!pending) return;
            window.clearTimeout(pending.timer);
            pending.selectionBlocker.classList.remove("word-lookup-press-pending");
            pendingLongPressRef.current = null;
        };

        const openLongPressLookup = (pending: PendingLongPress) => {
            // Only reachable if someone long-presses in the first moments of a cold
            // load, before the warm-up has landed. The press then behaves as it did
            // before this feature existed, and the list is on its way for the next one.
            const wordLookup = loadedWordLookup;
            if (!wordLookup) {
                void loadWordLookup();
                return;
            }
            const { findLookupTextAtOffset, lookupWordEntries } = wordLookup;

            const position = textPositionAtPoint(pending.startX, pending.startY);
            if (!position || !pending.target.contains(position.node)) return;
            const lookupText = findLookupTextAtOffset(position.node.data, position.offset, translator);
            if (!lookupText) return;

            const entries = lookupWordEntries(lookupText.text, translator);
            if (entries.length === 0) logMissingWordLookup(lookupText.text);
            pending.triggered = true;
            suppressedClickRef.current = { target: pending.target, expiresAt: Date.now() + 1200 };
            setCandidate(null);
            setResult({ text: lookupText.text, position: positionNearPoint(pending.startX, pending.startY), entries });
            window.getSelection()?.removeAllRanges();
        };

        const startLongPress = (event: PointerEvent) => {
            if (event.pointerType !== "touch" || !(event.target instanceof Element) || longPressIsDisabled(event.target)) return;
            void loadWordLookup();
            finishPendingPress();
            setCandidate(null);
            const selectionBlocker = event.target.closest(".card-header") ?? event.target;
            selectionBlocker.classList.add("word-lookup-press-pending");
            const pending: PendingLongPress = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                target: event.target,
                selectionBlocker,
                timer: 0,
                triggered: false,
            };
            pending.timer = window.setTimeout(() => openLongPressLookup(pending), LONG_PRESS_DELAY);
            pendingLongPressRef.current = pending;
        };

        const moveLongPress = (event: PointerEvent) => {
            const pending = pendingLongPressRef.current;
            if (!pending || pending.pointerId !== event.pointerId || pending.triggered) return;
            if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > LONG_PRESS_MOVE_LIMIT) finishPendingPress();
        };

        const endLongPress = (event: PointerEvent) => {
            const pending = pendingLongPressRef.current;
            if (!pending || pending.pointerId !== event.pointerId) return;
            if (pending.triggered) event.preventDefault();
            finishPendingPress();
        };

        const suppressLongPressClick = (event: MouseEvent) => {
            const suppressed = suppressedClickRef.current;
            if (!suppressed || Date.now() > suppressed.expiresAt) {
                suppressedClickRef.current = null;
                return;
            }
            if (!(event.target instanceof Element) || !targetsOverlap(suppressed.target, event.target)) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            suppressedClickRef.current = null;
        };

        const suppressNativeLongPressMenu = (event: MouseEvent) => {
            const pending = pendingLongPressRef.current;
            if (pending && event.target instanceof Element && targetsOverlap(pending.target, event.target)) event.preventDefault();
        };

        document.addEventListener("pointerdown", startLongPress, true);
        document.addEventListener("pointermove", moveLongPress, true);
        document.addEventListener("pointerup", endLongPress, true);
        document.addEventListener("pointercancel", endLongPress, true);
        document.addEventListener("click", suppressLongPressClick, true);
        document.addEventListener("contextmenu", suppressNativeLongPressMenu, true);
        return () => {
            finishPendingPress();
            document.removeEventListener("pointerdown", startLongPress, true);
            document.removeEventListener("pointermove", moveLongPress, true);
            document.removeEventListener("pointerup", endLongPress, true);
            document.removeEventListener("pointercancel", endLongPress, true);
            document.removeEventListener("click", suppressLongPressClick, true);
            document.removeEventListener("contextmenu", suppressNativeLongPressMenu, true);
        };
    }, [translator]);

    useEffect(() => {
        if (!result) return;
        const closeOutside = (event: PointerEvent) => {
            if (!resultRef.current?.contains(event.target as Node)) setResult(null);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setResult(null);
        };
        document.addEventListener("pointerdown", closeOutside);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOutside);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [result]);

    const searchSelection = async () => {
        if (!candidate) return;
        const { lookupWordEntries } = await loadWordLookup();
        const entries = lookupWordEntries(candidate.text, translator);
        if (entries.length === 0) logMissingWordLookup(candidate.text);
        setResult({ ...candidate, position: { ...candidate.position, left: positionForCard(candidate.position.left) }, entries });
        setCandidate(null);
        window.getSelection()?.removeAllRanges();
    };

    const positionStyle = (position: LookupPosition): CSSProperties => ({
        left: `${position.left}px`,
        top: position.top === undefined ? undefined : `${position.top}px`,
        bottom: position.bottom === undefined ? undefined : `${position.bottom}px`,
    });

    return createPortal(
        <div className="selection-word-lookup">
            {candidate && (
                <button
                    type="button"
                    className="selection-lookup-trigger"
                    style={positionStyle(candidate.position)}
                    onPointerDown={event => event.preventDefault()}
                    onClick={() => void searchSelection()}
                >
                    <Search aria-hidden="true" />
                    {translator.translate("Sök")}
                </button>
            )}
            {result && (
                <div
                    ref={resultRef}
                    className="selection-lookup-card"
                    style={positionStyle(result.position)}
                    role="dialog"
                    aria-label={translator.translate("Ordlista: {0}", { params: [result.text] })}
                >
                    <header>
                        <strong>{result.text}</strong>
                        <button type="button" aria-label={translator.translate("Stäng")} onClick={() => setResult(null)}>
                            <X aria-hidden="true" />
                        </button>
                    </header>
                    {result.entries.length > 0 ? result.entries.map(entry => (
                        <section key={entry.index} className="selection-lookup-entry">
                            <div>
                                <strong>{entry.romaji}</strong>
                                {entry.kanji && <span lang="ja">{entry.kanji}</span>}
                            </div>
                            {entry.meanings && <p>{entry.meanings.map(meaning => translator.translate(meaning)).join(" · ")}</p>}
                        </section>
                    )) : (
                        <section className="selection-lookup-missing">
                            <p>{translator.translate("Saknas i ordlistan.")}</p>
                            <small>{translator.translate("Uppslaget har sparats på den här enheten för senare granskning.")}</small>
                        </section>
                    )}
                </div>
            )}
        </div>,
        document.body,
    );
};

const positionForCard = (selectionCenter: number): number => {
    const halfCardWidth = Math.min(176, (window.innerWidth - 24) / 2);
    return Math.max(halfCardWidth + 12, Math.min(window.innerWidth - halfCardWidth - 12, selectionCenter));
};

export default SelectionWordLookup;
