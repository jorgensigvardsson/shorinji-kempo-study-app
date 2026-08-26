import { useContext, useEffect, useState } from "react";
import { Button, Card, Form, Spinner } from "react-bootstrap";
import { TranslatorContext } from "./i18n";
import { getSyncManager } from "./sync/manager";
import { AdminRequestError, type MyTransfer, type PublicBranch } from "./sync/backend";

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
const MyBranch = () => {
  const translator = useContext(TranslatorContext);
  const info = getSyncManager().getBackendUserInfo();

  const [branches, setBranches] = useState<PublicBranch[] | null>(null);
  const [transfer, setTransfer] = useState<MyTransfer | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [fetchedBranches, fetchedTransfer] = await Promise.all([
          getSyncManager().listBranches(),
          getSyncManager().myTransfer(),
        ]);
        if (!live) return;
        setBranches(fetchedBranches);
        setTransfer(fetchedTransfer);
        setLoadError(false);
      } catch {
        if (live) setLoadError(true);
      }
    })();
    return () => { live = false; };
  }, [attempt]);

  const reload = () => setAttempt(n => n + 1);

  const ask = async () => {
    if (destination === "") return;
    setBusy(true);
    setError(null);
    try {
      await getSyncManager().requestTransfer(destination, note.trim());
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
      setTransfer(null);
    } catch {
      setError(translator.translate("Ansökan kunde inte tas tillbaka. Försök igen."));
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <div>
        <p className="text-danger">{translator.translate("Kunde inte hämta klubbarna.")}</p>
        <Button variant="outline-secondary" onClick={reload}>{translator.translate("Försök igen")}</Button>
      </div>
    );
  }

  if (branches === null) {
    return (
      <div className="d-flex align-items-center gap-2">
        <Spinner animation="border" size="sm" /> {translator.translate("Laddar…")}
      </div>
    );
  }

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
    <div>
      <h1 className="h4">{translator.translate("Min klubb")}</h1>

      <Card className="mb-3">
        <Card.Body>
          <div className="small text-body-secondary">{translator.translate("Du tränar i")}</div>
          <div className="fs-5">
            {current?.name ?? <span className="text-body-secondary">{translator.translate("Ingen klubb")}</span>}
          </div>
          {current?.federationName !== undefined && current.federationName !== "" && (
            <div className="text-body-secondary">{current.federationName}</div>
          )}
        </Card.Body>
      </Card>

      {error !== null && <p className="text-danger">{error}</p>}

      {transfer !== null ? (
        <Card>
          <Card.Body className="d-flex flex-column gap-2">
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
          </Card.Body>
        </Card>
      ) : (
        <Card>
          <Card.Body className="d-flex flex-column gap-3">
            <div>
              <Form.Label className="mb-1">{translator.translate("Byt klubb")}</Form.Label>
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
          </Card.Body>
        </Card>
      )}
    </div>
  );
};

export default MyBranch;
