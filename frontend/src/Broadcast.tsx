import { useContext, useState, type FormEvent } from "react";
import { Button, Form } from "react-bootstrap";
import { TranslatorContext } from "./i18n";
import { broadcastPush } from "./push";

// Admin-only action page: compose and send a push notification to every
// subscriber. The route is only registered for admins (see routes.tsx) and the
// backend independently enforces the "admin" role on /push/broadcast.
const Broadcast = () => {
    const translator = useContext(TranslatorContext);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const trimmedTitle = title.trim();
        if (!trimmedTitle || busy) return;
        setBusy(true);
        setStatus(null);
        try {
            const res = await broadcastPush({
                title: trimmedTitle,
                body: body.trim() || undefined,
                url: url.trim() || undefined,
            });
            setStatus({ ok: true, text: translator.translate("Notis skickad till {0} mottagare.", { params: [String(res.sent)] }) });
            setTitle("");
            setBody("");
            setUrl("");
        } catch {
            setStatus({ ok: false, text: translator.translate("Det gick inte att skicka notisen. Försök igen.") });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <p className="text-secondary">
                {translator.translate("Skicka ett meddelande till alla enheter som har aktiverat notiser.")}
            </p>
            <Form as="form" onSubmit={(e) => { void submit(e); }} style={{ maxWidth: "32rem" }}>
                <Form.Group className="mb-3" controlId="broadcastTitle">
                    <Form.Label>{translator.translate("Rubrik")}</Form.Label>
                    <Form.Control value={title} onChange={e => { setTitle(e.target.value); setStatus(null); }} />
                </Form.Group>
                <Form.Group className="mb-3" controlId="broadcastBody">
                    <Form.Label>{translator.translate("Meddelande")}</Form.Label>
                    <Form.Control as="textarea" rows={3} value={body} onChange={e => setBody(e.target.value)} />
                </Form.Group>
                <Form.Group className="mb-3" controlId="broadcastUrl">
                    <Form.Label>{translator.translate("Länk (valfri)")}</Form.Label>
                    <Form.Control value={url} onChange={e => setUrl(e.target.value)} placeholder="/changelog" />
                </Form.Group>
                <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
                    {busy ? translator.translate("Skickar…") : translator.translate("Skicka notis")}
                </Button>
            </Form>
            {status && (
                <p className={`mt-3 ${status.ok ? "text-success" : "text-danger"}`}>{status.text}</p>
            )}
        </div>
    );
};

export default Broadcast;
