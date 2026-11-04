import { useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import type { Translator } from "../i18n";

interface Props {
  translator: Translator;
  busy: boolean;
  onCreate: (name: string) => void;
  onCancel: () => void;
}

// The form for adding a branch, wherever one can be added: inside a federation,
// or directly under WSKO. Where it goes is the caller's to know; this only asks
// what it is called.
const NewBranchForm = ({ translator, busy, onCreate, onCancel }: Props) => {
  const [name, setName] = useState("");
  const submit = () => {
    const trimmed = name.trim();
    if (trimmed !== "" && !busy) onCreate(trimmed);
  };

  return (
    <div className="d-flex gap-2 flex-wrap align-items-center justify-content-end">
      <Form.Control
        size="sm"
        autoFocus
        style={{ maxWidth: "20rem" }}
        value={name}
        disabled={busy}
        placeholder={translator.translate("Klubbens namn")}
        aria-label={translator.translate("Klubbens namn")}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); }}
      />
      <Button size="sm" variant="primary" disabled={busy || name.trim() === ""} onClick={submit}>
        {busy ? <Spinner size="sm" /> : translator.translate("Lägg till")}
      </Button>
      <Button size="sm" variant="outline-secondary" disabled={busy} onClick={onCancel}>
        {translator.translate("Avbryt")}
      </Button>
    </div>
  );
};

export default NewBranchForm;
