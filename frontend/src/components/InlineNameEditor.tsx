import { useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import type { Translator } from "../i18n";

interface Props {
  translator: Translator;
  // What the name is now, which the field opens on.
  initial: string;
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}

/**
 * The field a RenamePencil opens: a name, and Spara/Avbryt beside it. It stands
 * in for the name it edits — a heading, a row in a list — while it is open.
 *
 * It will not save an empty name, nor one that has not changed: the first would
 * leave the thing nameless, the second is a write that reads as an edit.
 */
const InlineNameEditor = ({ translator, initial, busy, onSave, onCancel }: Props) => {
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  const savable = !busy && trimmed !== "" && trimmed !== initial;
  const save = () => { if (savable) onSave(trimmed); };

  return (
    <div className="d-flex gap-2 flex-grow-1" style={{ maxWidth: "28rem" }}>
      <Form.Control
        size="sm"
        autoFocus
        value={name}
        disabled={busy}
        aria-label={translator.translate("Namn")}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onCancel();
        }}
      />
      <Button size="sm" variant="primary" disabled={!savable} onClick={save}>
        {busy ? <Spinner size="sm" /> : translator.translate("Spara")}
      </Button>
      <Button size="sm" variant="outline-secondary" disabled={busy} onClick={onCancel}>
        {translator.translate("Avbryt")}
      </Button>
    </div>
  );
};

export default InlineNameEditor;
