import { useContext } from "react";
import { Button, Spinner } from "react-bootstrap";
import { TranslatorContext } from "../i18n";

// Sits beside numbers that may be the last ones fetched rather than the latest:
// a spinner while they are being refreshed, and a quiet note with a retry when
// the refresh failed and what is on screen is what was there before.
const RefreshState = ({ refreshing, failed, onRetry }: { refreshing: boolean; failed: boolean; onRetry: () => void }) => {
  const translator = useContext(TranslatorContext);
  if (refreshing) {
    return (
      <span className="d-inline-flex align-items-center gap-1 small text-body-secondary" role="status">
        <Spinner animation="border" size="sm" aria-hidden="true" />
        {translator.translate("Uppdaterar…")}
      </span>
    );
  }
  if (failed) {
    return (
      <span className="d-inline-flex align-items-center gap-2 small text-danger" role="status">
        {translator.translate("Kunde inte uppdatera. Siffrorna är de senast hämtade.")}
        <Button variant="link" size="sm" className="p-0" onClick={onRetry}>{translator.translate("Försök igen")}</Button>
      </span>
    );
  }
  return null;
};

export default RefreshState;
