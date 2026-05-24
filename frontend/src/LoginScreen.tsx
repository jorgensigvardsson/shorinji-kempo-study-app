import { useContext, useMemo, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import { type Language, TranslationsContext, TranslatorImplementation } from "./i18n";
import { getSyncManager } from "./sync/manager";
import "./LoginScreen.css";

const authUrl = (import.meta.env.VITE_AUTH_URL as string | undefined) ?? "http://localhost:8081";

const SUPPORTED: Language[] = ["sv", "en", "tr", "ja"];

function detectBrowserLanguage(): Language {
  for (const lang of navigator.languages ?? [navigator.language]) {
    const primary = lang.split("-")[0].toLowerCase() as Language;
    if (SUPPORTED.includes(primary)) return primary;
  }
  return "sv";
}

interface Props {
  onContinueAnonymously: () => void;
}

export function LoginScreen({ onContinueAnonymously }: Props) {
  const translations = useContext(TranslationsContext);
  const translator = useMemo(
    () => new TranslatorImplementation(translations, detectBrowserLanguage()),
    [translations]
  );
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveDomain = async (emailValue: string): Promise<boolean> => {
    const resp = await fetch(
      `${authUrl}/auth/resolve?email=${encodeURIComponent(emailValue)}`,
      { credentials: "include" }
    );
    return resp.ok;
  };

  const handleBlur = async () => {
    const trimmed = email.trim();
    // Only validate once the address looks complete (has a non-empty domain part).
    const atIdx = trimmed.indexOf("@");
    if (atIdx < 0 || atIdx >= trimmed.length - 1) return;
    try {
      const ok = await resolveDomain(trimmed);
      if (!ok) setError(translator.translate("Inloggning är inte tillgänglig för den här e-postdomänen."));
    } catch {
      // Network error during blur — silently ignore; submit will surface it.
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const ok = await resolveDomain(trimmed);
      if (ok) {
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
              onChange={e => { setEmail(e.target.value); setError(null); }}
              onBlur={() => { void handleBlur(); }}
              placeholder="namn@example.com"
              disabled={loading}
              isInvalid={error !== null}
              autoFocus
            />
            <Form.Control.Feedback type="invalid">{error}</Form.Control.Feedback>
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
            {translator.translate("Fortsätt utan konto")}
          </Button>
        </div>
      </div>
    </div>
  );
}
