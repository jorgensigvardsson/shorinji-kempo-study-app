import { useState } from "react";
import { Button, Form, Modal, Spinner } from "react-bootstrap";
import type { Translator } from "./i18n";
import { getSyncManager } from "./sync/manager";

const authUrl = (import.meta.env.VITE_AUTH_URL as string | undefined) ?? "http://localhost:8081";

interface Props {
  translator: Translator;
  show: boolean;
  onContinueAnonymously: () => void;
}

export function SignInModal({ translator, show, onContinueAnonymously }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const resp = await fetch(
        `${authUrl}/auth/resolve?email=${encodeURIComponent(trimmed)}`,
        { credentials: "include" }
      );
      if (resp.ok) {
        getSyncManager().beginBackendAuthorization(trimmed);
        // Page will navigate away; keep loading spinner shown.
      } else {
        setError(translator.translate("Inloggning är inte tillgänglig för den här e-postdomänen."));
        setLoading(false);
      }
    } catch {
      setError(translator.translate("Inloggning misslyckades. Försök igen."));
      setLoading(false);
    }
  };

  return (
    <Modal show={show} backdrop="static" centered keyboard={false}>
      <Modal.Body className="p-4">
        <p className="text-body-secondary mb-4">
          {translator.translate("Spara dina framsteg på alla enheter genom att logga in.")}
        </p>

        <Form onSubmit={(e) => { void handleSignIn(e); }}>
          <Form.Group className="mb-3" controlId="signInEmail">
            <Form.Label>{translator.translate("Din e-postadress")}</Form.Label>
            <Form.Control
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="namn@example.com"
              disabled={loading}
              autoFocus
            />
            {error && (
              <Form.Text className="text-danger d-block mt-1">{error}</Form.Text>
            )}
          </Form.Group>

          <div className="d-grid mb-2">
            <Button type="submit" variant="primary" disabled={loading || !email.trim()}>
              {loading
                ? <><Spinner size="sm" className="me-2" />{translator.translate("Logga in")}…</>
                : translator.translate("Logga in")}
            </Button>
          </div>
        </Form>

        <hr />

        <div className="d-grid">
          <Button variant="outline-secondary" onClick={onContinueAnonymously} disabled={loading}>
            {translator.translate("Fortsätt anonymt")}
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
}
