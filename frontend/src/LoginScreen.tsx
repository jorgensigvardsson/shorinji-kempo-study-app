import { useContext, useMemo, useState } from "react";
import { Button, Form, Modal, Spinner } from "react-bootstrap";
import { type Language, noTranslate, TranslationsContext, TranslatorImplementation } from "./i18n";
import PrivacyPolicy from "./PrivacyPolicy";
import { getSyncManager } from "./sync/manager";
import { RateLimitError } from "./sync/backend";
import "./LoginScreen.css";

const SUPPORTED: Language[] = ["sv", "en", "tr", "ja"];

// Each language's own name for itself, so it stays recognizable no matter
// which language is currently selected — never run through the translator.
const LANGUAGE_NAMES: Record<Language, string> = {
  sv: "Svenska",
  en: "English",
  tr: "Türkçe",
  ja: "日本語",
};

function detectBrowserLanguage(): Language {
  for (const lang of navigator.languages ?? [navigator.language]) {
    const primary = lang.split("-")[0].toLowerCase() as Language;
    if (SUPPORTED.includes(primary)) return primary;
  }
  return "sv";
}

// "email": collecting the address. "code": a code was emailed and we're awaiting it.
type Phase = "email" | "code";

export function LoginScreen() {
  const translations = useContext(TranslationsContext);
  // Detection picks the initial language; the links below let the user override it.
  const [language, setLanguage] = useState<Language>(detectBrowserLanguage);
  const translator = useMemo(
    () => new TranslatorImplementation(translations, language),
    [translations, language]
  );

  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Submit the email: redirect to OIDC, or move to the code phase.
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    try {
      const result = await getSyncManager().startEmailAuth(trimmed, language);
      if (result.action === "oidc") {
        getSyncManager().beginBackendAuthorization(trimmed);
        return; // page navigates away; keep the spinner
      }
      setNeedsName(result.action === "new");
      setPhase("code");
    } catch (err) {
      setError(err instanceof RateLimitError
        ? translator.translate("Vänta några sekunder och försök igen.")
        : translator.translate("Inloggning misslyckades. Försök igen."));
    } finally {
      setLoading(false);
    }
  };

  // Submit the verification code (and name, for new users).
  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = code.trim();
    if (!trimmedCode) return;

    setLoading(true);
    setError(null);
    try {
      const result = await getSyncManager().verifyEmailCode(email.trim(), trimmedCode, name.trim());
      if (result.ok) {
        getSyncManager().completeEmailLogin(); // switches provider → App hides the login screen
        return;
      }
      setError(result.error === "too_many_attempts"
        ? translator.translate("För många försök. Begär en ny kod.")
        : translator.translate("Fel kod. Försök igen."));
    } catch {
      setError(translator.translate("Inloggning misslyckades. Försök igen."));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getSyncManager().startEmailAuth(email.trim(), language);
      if (result.action === "oidc") {
        getSyncManager().beginBackendAuthorization(email.trim());
        return;
      }
      setNeedsName(result.action === "new");
      setCode("");
    } catch (err) {
      setError(err instanceof RateLimitError
        ? translator.translate("Vänta några sekunder och försök igen.")
        : translator.translate("Inloggning misslyckades. Försök igen."));
    } finally {
      setLoading(false);
    }
  };

  const backToEmail = () => {
    setPhase("email");
    setCode("");
    setName("");
    setNeedsName(false);
    setError(null);
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

        {phase === "email" ? (
          <Form onSubmit={(e) => { void handleEmailSubmit(e); }}>
            <Form.Group className="mb-3" controlId="loginEmail">
              <Form.Label>{translator.translate("Din e-postadress")}</Form.Label>
              <Form.Control
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null); }}
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
        ) : (
          <Form onSubmit={(e) => { void handleCodeSubmit(e); }}>
            <p className="text-body-secondary">
              {translator.translate("Vi har skickat en verifieringskod till din e-post.")}
            </p>

            {needsName && (
              <Form.Group className="mb-3" controlId="loginName">
                <Form.Label>{translator.translate("Ditt namn")}</Form.Label>
                <Form.Control
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
              </Form.Group>
            )}

            <Form.Group className="mb-3" controlId="loginCode">
              <Form.Label>{translator.translate("Verifieringskod")}</Form.Label>
              <Form.Control
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={e => { setCode(e.target.value); setError(null); }}
                disabled={loading}
                isInvalid={error !== null}
                autoFocus={!needsName}
              />
              <Form.Control.Feedback type="invalid">{error}</Form.Control.Feedback>
            </Form.Group>

            <div className="d-grid mb-2">
              <Button type="submit" variant="primary" disabled={loading || !code.trim()}>
                {loading
                  ? <><Spinner size="sm" className="me-2" />{translator.translate("Bekräfta")}…</>
                  : translator.translate("Bekräfta")}
              </Button>
            </div>

            <div className="d-flex justify-content-between">
              <Button variant="link" size="sm" className="p-0" onClick={() => { void handleResend(); }} disabled={loading}>
                {translator.translate("Skicka ny kod")}
              </Button>
              <Button variant="link" size="sm" className="p-0 text-body-secondary" onClick={backToEmail} disabled={loading}>
                {translator.translate("Använd en annan e-postadress")}
              </Button>
            </div>
          </Form>
        )}

        <hr />

        <div className="text-center">
          <Button variant="link" size="sm" className="p-0 text-body-secondary" onClick={() => setShowPrivacy(true)}>
            {translator.translate("Integritetspolicy")}
          </Button>
        </div>

        <div className="login-screen-langs">
          {SUPPORTED.map(lang => (
            <button
              key={lang}
              type="button"
              className="login-screen-lang-btn"
              aria-current={lang === language}
              onClick={() => setLanguage(lang)}
            >
              {noTranslate(LANGUAGE_NAMES[lang])}
            </button>
          ))}
        </div>
      </div>

      <Modal show={showPrivacy} onHide={() => setShowPrivacy(false)} scrollable>
        <Modal.Header closeButton>
          <Modal.Title>{translator.translate("Integritetspolicy")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <PrivacyPolicy />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowPrivacy(false)}>
            {translator.translate("Stäng")}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
