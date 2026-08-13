import { useContext, useState, type FormEvent } from "react";
import { Button, Form } from "react-bootstrap";
import { TranslatorContext } from "./i18n";
import { getSyncManager } from "./sync/manager";
import { RateLimitError } from "./sync/backend";

// Sends free-text feedback to the app's maintainer. Replaces the previous
// mailto: link now that every user is signed in and has a backend session —
// the backend attributes and relays the message instead of relying on a local
// mail client.
const Feedback = () => {
    const translator = useContext(TranslatorContext);
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const trimmed = message.trim();
        if (!trimmed || busy) return;
        setBusy(true);
        setStatus(null);
        try {
            await getSyncManager().submitFeedback(trimmed);
            setStatus({ ok: true, text: translator.translate("Tack för din feedback!") });
            setMessage("");
        } catch (err) {
            setStatus({
                ok: false,
                text: err instanceof RateLimitError
                    ? translator.translate("Vänta några sekunder och försök igen.")
                    : translator.translate("Det gick inte att skicka feedbacken. Försök igen."),
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <p className="text-secondary">
                {translator.translate("Berätta vad du tycker om appen, eller rapportera ett problem. Meddelandet skickas till den som utvecklar appen.")}
            </p>
            <Form as="form" onSubmit={(e) => { void submit(e); }} style={{ maxWidth: "32rem" }}>
                <Form.Group className="mb-3" controlId="feedbackMessage">
                    <Form.Label>{translator.translate("Din feedback")}</Form.Label>
                    <Form.Control as="textarea" rows={6} value={message} onChange={e => { setMessage(e.target.value); setStatus(null); }} />
                </Form.Group>
                <Button type="submit" variant="primary" disabled={busy || !message.trim()}>
                    {busy ? translator.translate("Skickar…") : translator.translate("Skicka feedback")}
                </Button>
            </Form>
            {status && (
                <p className={`mt-3 ${status.ok ? "text-success" : "text-danger"}`}>{status.text}</p>
            )}
        </div>
    );
};

export default Feedback;
