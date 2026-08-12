import { useEffect, useRef, useState } from "react";
import { Card, Collapse } from "react-bootstrap";
import { ChevronDoubleDown, ChevronDoubleUp } from "react-bootstrap-icons";

let focusedCardCount = 0;

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
    const canCollapse = showCollapse ?? true;

    useEffect(() => {
        onOpenChange?.(open);
    }, [onOpenChange, open]);

    useEffect(() => {
        if (!open || !focusOnOpen) return;

        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const navbarBottom = document.querySelector<HTMLElement>(".navbar")?.getBoundingClientRect().bottom ?? 0;
        document.body.style.setProperty("--card-focus-top", `${Math.max(0, navbarBottom)}px`);
        focusedCardCount += 1;
        document.body.classList.add("card-focus-active");
        const focusFrame = window.requestAnimationFrame(() => headerRef.current?.focus({ preventScroll: true }));
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", closeOnEscape);

        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.removeEventListener("keydown", closeOnEscape);
            focusedCardCount = Math.max(0, focusedCardCount - 1);
            if (focusedCardCount === 0) {
                document.body.classList.remove("card-focus-active");
                document.body.style.removeProperty("--card-focus-top");
            }
            if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
        };
    }, [focusOnOpen, open]);

    let style = {};
    if (canCollapse)
        style = {...style, cursor: "pointer"};

    const cardClassName = `${className ?? ""} ${focusOnOpen ? "focus-card" : ""} ${open ? "is-expanded" : "is-collapsed"}`.trim();
    const toggleOpen = () => {
        if (canCollapse) setOpen(value => !value);
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
                            {open ? <ChevronDoubleUp size={13} /> : <ChevronDoubleDown size={13} />}
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
