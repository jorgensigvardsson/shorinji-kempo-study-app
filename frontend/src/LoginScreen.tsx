import { useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import type { Translator } from "./i18n";
import { getSyncManager } from "./sync/manager";
import "./LoginScreen.css";

const authUrl = (import.meta.env.VITE_AUTH_URL as string | undefined) ?? "http://localhost:8081";

interface Props {
  translator: Translator;
  onContinueAnonymously: () => void;
}

export function LoginScreen({ translator, onContinueAnonymously }: Props) {
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
        // Page navigates away; keep spinner shown.
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
    <div className="login-screen">
      <div className="login-screen-card">
        <div className="login-screen-brand">
          <img src="/shorinjikempo.png" alt="" className="login-screen-logo" />
          <span className="login-screen-title">Shorinji Kempo</span>
        </div>

        <p className="text-body-secondary login-screen-subtitle">
          {translator.translate("Spara dina framsteg på alla enheter genom att logga in.")}
        </p>

        <Form onSubmit={(e) => { void handleSignIn(e); }}>
          <Form.Group className="mb-3" controlId="loginEmail">
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
      </div>
    </div>
  );
}
