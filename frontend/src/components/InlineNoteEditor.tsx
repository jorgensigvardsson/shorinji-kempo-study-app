import { useContext, useEffect, useRef, useState } from "react";
import { Form } from "react-bootstrap";
import { Pencil } from "react-bootstrap-icons";
import { noTranslate, TranslatorContext } from "../i18n";
import "./InlineNoteEditor.css";

interface Props {
    value: string;
    onSave: (value: string) => void;
    addLabel: string;
    editLabel: string;
    inputLabel: string;
    placeholder: string;
    emptyLabel?: string;
    className?: string;
    // Longest note this editor accepts. The counter appears only near the limit, so a
    // note of ordinary length is written without a number watching.
    maxLength?: number;
}

const InlineNoteEditor = ({
    value,
    onSave,
    addLabel,
    editLabel,
    inputLabel,
    placeholder,
    emptyLabel,
    className,
    maxLength,
}: Props) => {
    const translator = useContext(TranslatorContext);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const [lastValue, setLastValue] = useState(value);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    if (lastValue !== value) {
        setLastValue(value);
        setDraft(value);
    }

    useEffect(() => {
        if (!editing || !textareaRef.current) return;
        textareaRef.current.focus();
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = textareaRef.current.value.length;
        textareaRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [editing]);

    const startEditing = () => {
        setDraft(value);
        setEditing(true);
    };

    const cancelEditing = () => {
        setDraft(value);
        setEditing(false);
    };

    const save = () => {
        const trimmed = draft.trim() ? draft : "";
        const nextValue = maxLength !== undefined && trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
        onSave(nextValue);
        setLastValue(nextValue);
        setDraft(nextValue);
        setEditing(false);
    };

    const classes = [
        "inline-note",
        value ? "has-note" : "",
        editing ? "is-editing" : "",
        className ?? "",
    ].filter(Boolean).join(" ");

    if (editing) {
        return (
            <Form.Group className={classes}>
                <Form.Control
                    ref={textareaRef}
                    as="textarea"
                    rows={2}
                    aria-label={inputLabel}
                    value={draft}
                    placeholder={placeholder}
                    maxLength={maxLength}
                    onChange={event => setDraft(event.target.value)}
                />
                {maxLength !== undefined && draft.length >= maxLength * 0.9 && (
                    <div
                        className="inline-note-counter"
                        // Announced only when it changes meaningfully, so a screen
                        // reader is not read a new number on every keystroke.
                        aria-live="polite"
                        aria-label={translator.translate("{0} av {1} tecken", {
                            params: [String(draft.length), String(maxLength)],
                        })}
                    >
                        {noTranslate(`${draft.length} / ${maxLength}`)}
                    </div>
                )}
                <div className="inline-note-actions">
                    <button type="button" className="btn btn-sm btn-primary" onClick={save}>
                        {translator.translate("Spara")}
                    </button>
                    <button type="button" className="inline-note-text-button" onClick={cancelEditing}>
                        {translator.translate("Avbryt")}
                    </button>
                </div>
            </Form.Group>
        );
    }

    const actionLabel = value ? editLabel : addLabel;
    return (
        <div className={classes}>
            <button
                type="button"
                className="inline-note-pencil"
                aria-label={actionLabel}
                title={actionLabel}
                onClick={startEditing}
            >
                <Pencil aria-hidden="true" />
            </button>
            {value && <span className="inline-note-text">{value}</span>}
            {!value && emptyLabel && (
                <button type="button" className="inline-note-empty-label" onClick={startEditing}>
                    {emptyLabel}
                </button>
            )}
        </div>
    );
};

export default InlineNoteEditor;
