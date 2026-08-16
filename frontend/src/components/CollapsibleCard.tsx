import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Collapse } from "react-bootstrap";
import { ChevronDown, ChevronUp } from "react-bootstrap-icons";

let focusedCardCount = 0;
let focusedCardHistoryId = 0;
const focusedCardHistoryKey = "__shorinjiFocusedCard";

interface Props extends React.PropsWithChildren {
    header: React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
    showCollapse?: boolean;
    inlineChevron?: boolean;
    defaultOpen?: boolean;
    focusOnOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
}

const CollapsibleCard = (props: Props) => {
    const { className, header, footer, showCollapse, inlineChevron, defaultOpen = false, focusOnOpen = false, onOpenChange, children } = props;
    const [open, setOpen] = useState(defaultOpen);
    const cardRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const historyIdRef = useRef<number | null>(null);
    const canCollapse = showCollapse ?? true;

    const closeFocusedCard = useCallback(() => {
        const historyId = historyIdRef.current;
        historyIdRef.current = null;
        setOpen(false);
        if (historyId !== null && window.history.state?.[focusedCardHistoryKey] === historyId) {
            window.history.back();
        }
    }, []);

    useEffect(() => {
        onOpenChange?.(open);
    }, [onOpenChange, open]);

    useEffect(() => {
        if (!open || !focusOnOpen) return;

        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const navbarBottom = document.querySelector<HTMLElement>(".navbar")?.getBoundingClientRect().bottom ?? 0;
        focusedCardHistoryId += 1;
        historyIdRef.current = focusedCardHistoryId;
        window.history.pushState({
            ...(window.history.state ?? {}),
            [focusedCardHistoryKey]: focusedCardHistoryId,
        }, "");
        document.body.style.setProperty("--card-focus-top", `${Math.max(0, navbarBottom)}px`);
        focusedCardCount += 1;
        document.body.classList.add("card-focus-active");
        const focusFrame = window.requestAnimationFrame(() => headerRef.current?.focus({ preventScroll: true }));
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") closeFocusedCard();
        };
        const closeOnHistoryNavigation = () => {
            historyIdRef.current = null;
            setOpen(false);
        };
        document.addEventListener("keydown", closeOnEscape);
        window.addEventListener("popstate", closeOnHistoryNavigation);

        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.removeEventListener("keydown", closeOnEscape);
            window.removeEventListener("popstate", closeOnHistoryNavigation);
            focusedCardCount = Math.max(0, focusedCardCount - 1);
            if (focusedCardCount === 0) {
                document.body.classList.remove("card-focus-active");
                document.body.style.removeProperty("--card-focus-top");
            }
            if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
        };
    }, [closeFocusedCard, focusOnOpen, open]);

    let style = {};
    if (canCollapse)
        style = {...style, cursor: "pointer"};

    const cardClassName = `${className ?? ""} ${focusOnOpen ? "focus-card" : ""} ${open ? "is-expanded" : "is-collapsed"}`.trim();
    const toggleOpen = () => {
        if (!canCollapse) return;
        if (open && focusOnOpen) closeFocusedCard();
        else setOpen(value => !value);
    };
    const headerContainsSelection = () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !headerRef.current) return false;
        return (selection.anchorNode && headerRef.current.contains(selection.anchorNode))
            || (selection.focusNode && headerRef.current.contains(selection.focusNode));
    };

    return (
        <Card ref={cardRef} className={cardClassName}>
            <Card.Header
                ref={headerRef}
                className="border-bottom-0"
                onClick={() => {
                    if (!headerContainsSelection()) toggleOpen();
                }}
                onKeyDown={event => {
                    if (event.target === event.currentTarget && canCollapse && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        toggleOpen();
                    }
                }}
                role={canCollapse ? "button" : undefined}
                tabIndex={canCollapse ? 0 : undefined}
                aria-expanded={canCollapse ? open : undefined}
                style={style}
            >
                <div className={`collapsible-card-header${inlineChevron ? " collapsible-card-header--inline" : ""}`}>
                    <div>{header}</div>
                    {canCollapse && (
                        <div className="collapsible-card-chevron">
                            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </div>
                    )}
                </div>
            </Card.Header>
            {canCollapse && (
                <Collapse in={open}>
                    <div>
                        <Card.Body>{children}</Card.Body>
                        {footer && <Card.Footer className="border-top-0">{footer}</Card.Footer>}
                    </div>
                </Collapse>
            )}
        </Card>
    )
}

export default CollapsibleCard;
