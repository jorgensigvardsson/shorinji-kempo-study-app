import { useContext, useEffect, useId, useState } from "react";
import { Button, Collapse, Form, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import { ArrowRight } from "react-bootstrap-icons";
import { TranslatorContext } from "./i18n";
import { getSyncManager } from "./sync/manager";
import { AdminRequestError, type MyTransfer, type PublicBranch } from "./sync/backend";
import Loading from "./components/Loading";
import FederationFlag from "./components/FederationFlag";
import DisclosureChevron from "./components/DisclosureChevron";

// The label for branches that belong to no federation. WSKO is the root of the
// organization rather than a record with a name, so the heading is the
// frontend's to supply — the same constant the registration picker uses.
const WSKO = "WSKO";

const maxNote = 500;

// A member's own place in the organization, and the one thing they can do about
// it: ask another branch to take them in.
//
// They ask for themselves. There is no handshake with the club they are leaving,
// which is both the truth — the kenshi is the one who moved — and the only
// arrangement that cannot strand somebody whose old club never answers.
const MyBranch = ({ branches, canManage = false }: { branches: PublicBranch[]; canManage?: boolean }) => {
  const translator = useContext(TranslatorContext);
  const info = getSyncManager().getBackendUserInfo();

  const [transfer, setTransfer] = useState<MyTransfer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [transferOpen, setTransferOpen] = useState(false);
  const transferFormId = useId();

  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const fetchedTransfer = await getSyncManager().myTransfer();
        if (!live) return;
        setTransfer(fetchedTransfer);
        setLoaded(true);
        setLoadError(false);
      } catch {
        if (live) setLoadError(true);
      }
    })();
    return () => { live = false; };
  }, [attempt]);

  const reload = () => {
    setLoaded(false);
    setLoadError(false);
    setAttempt(n => n + 1);
  };

  const ask = async () => {
    if (destination === "") return;
    setBusy(true);
    setError(null);
    try {
      await getSyncManager().requestTransfer(destination, note.trim());
      setTransferOpen(false);
      setDestination("");
      setNote("");
      reload();
    } catch (err) {
      if (err instanceof AdminRequestError && err.status === 409) {
        setError(translator.translate("Du har redan en ansökan som väntar på svar."));
      } else if (err instanceof AdminRequestError && err.status === 429) {
        setError(translator.translate("För många ansökningar just nu. Försök igen om en stund."));
      } else {
        setError(translator.translate("Ansökan kunde inte skickas. Försök igen."));
      }
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      await getSyncManager().withdrawTransfer();
      setTransferOpen(false);
      setTransfer(null);
    } catch {
      setError(translator.translate("Ansökan kunde inte tas tillbaka. Försök igen."));
    } finally {
      setBusy(false);
    }
  };

  const current = branches.find(b => b.id === info?.branchId);

  // Grouped by federation, WSKO last — the same order the registration picker
  // uses, so the list of clubs reads the same wherever it appears.
  const groups = new Map<string, PublicBranch[]>();
  for (const branch of branches) {
    if (branch.id === info?.branchId) continue; // no point asking to stay
    const heading = branch.federationName ?? WSKO;
    groups.set(heading, [...(groups.get(heading) ?? []), branch]);
  }
  const headings = [...groups.keys()].sort((a, b) =>
    a === WSKO ? 1 : b === WSKO ? -1 : a.localeCompare(b));

  return (
    <section className="clubs-own-section" aria-labelledby="my-club-heading">
      <header className="clubs-own-summary">
          <h2 id="my-club-heading" className="app-eyebrow-heading">{translator.translate("Min klubb")}</h2>
          <p className="clubs-own-name">
            {current?.name ?? <span className="text-body-secondary">{translator.translate("Ingen klubb")}</span>}
          </p>
          {current && (
            <p className="clubs-own-federation text-body-secondary">
              {current.federationId && <FederationFlag federationId={current.federationId} className="me-1" />}
              {current.federationName ?? WSKO}
            </p>
          )}
      </header>

      <div className="clubs-own-actions d-flex flex-wrap gap-2">
        {canManage && current && <Link className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
                                      to={`/admin/branches/${encodeURIComponent(current.id)}/members`}>
          {translator.translate("Administrera klubben")}<ArrowRight aria-hidden="true" />
        </Link>}
        {loaded && !loadError && transfer === null &&
          <Button variant="outline-secondary" className="d-inline-flex align-items-center gap-2"
                  aria-expanded={transferOpen} aria-controls={transferFormId}
                  onClick={() => setTransferOpen(open => !open)}>
            {translator.translate("Byt klubb")}<DisclosureChevron expanded={transferOpen} />
          </Button>}
      </div>

      {error !== null && <p className="text-danger">{error}</p>}

      {loadError ? (
        <div role="alert">
          <p className="text-danger">{translator.translate("Kunde inte hämta ditt klubbbyte.")}</p>
          <Button variant="outline-secondary" onClick={reload}>{translator.translate("Försök igen")}</Button>
        </div>
      ) : !loaded ? <Loading /> : transfer !== null ? (
          <div className="clubs-transfer-status d-flex flex-column gap-2" role="status">
            {transfer.status === "pending" ? (
              <>
                <div>
                  {translator.translate("Du har ansökt om att byta till")} <strong>{transfer.toBranchName}</strong>.
                </div>
                <div className="text-body-secondary small">
                  {translator.translate("Klubbens administratörer har fått din ansökan och svarar via e-post.")}
                </div>
                <div>
                  <Button variant="outline-secondary" size="sm" disabled={busy} onClick={() => { void withdraw(); }}>
                    {busy ? <Spinner size="sm" /> : translator.translate("Ta tillbaka ansökan")}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  {translator.translate("Din ansökan om att byta till")} <strong>{transfer.toBranchName}</strong> {translator.translate("godkändes inte.")}
                </div>
                <div className="text-body-secondary small">
                  {translator.translate("Du är kvar i din nuvarande klubb. Du kan ansöka igen.")}
                </div>
                <div>
                  <Button variant="outline-secondary" size="sm" disabled={busy} onClick={() => { void withdraw(); }}>
                    {busy ? <Spinner size="sm" /> : translator.translate("Rensa")}
                  </Button>
                </div>
              </>
            )}
          </div>
      ) : (
        <Collapse in={transferOpen}>
          <div id={transferFormId} className="clubs-transfer">
          <div className="clubs-transfer-form d-flex flex-column gap-3">
            <div>
              <div className="text-body-secondary small mb-2">
                {translator.translate("Har du flyttat? Ansök hos den klubb du vill träna i — deras administratörer avgör.")}
              </div>
              <Form.Select
                value={destination}
                disabled={busy}
                aria-label={translator.translate("Klubb")}
                onChange={e => setDestination(e.target.value)}
              >
                <option value="">{translator.translate("Välj klubb")}</option>
                {headings.map(heading => (
                  <optgroup key={heading} label={heading}>
                    {(groups.get(heading) ?? []).map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </optgroup>
                ))}
              </Form.Select>
            </div>

            <div>
              <Form.Label className="mb-1">{translator.translate("Meddelande (frivilligt)")}</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={note}
                maxLength={maxNote}
                disabled={busy}
                aria-label={translator.translate("Meddelande (frivilligt)")}
                placeholder={translator.translate("Till exempel varför du byter, eller när du börjar träna.")}
                onChange={e => setNote(e.target.value)}
              />
            </div>

            <div>
              <Button variant="primary" disabled={busy || destination === ""} onClick={() => { void ask(); }}>
                {busy ? <Spinner size="sm" /> : translator.translate("Skicka ansökan")}
              </Button>
            </div>
          </div>
          </div>
        </Collapse>
      )}
    </section>
  );
};

export default MyBranch;
