import { useEffect, useMemo, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import type { Translator } from "./i18n";
import { getSyncManager } from "./sync/manager";
import { RateLimitError, type JoinContext, type PublicBranch } from "./sync/backend";

// WSKO is the root of the organization and is never stored as a record, so
// branches attached directly to it come back with no federation. The heading is
// a proper noun like every other organization name — a constant here, not an
// entry in translations.json.
const WSKO = "WSKO";

type Props = {
  translator: Translator;
  language: string;
  // Returns to the sign-in form, for somebody who arrived here by mistake or
  // whose ticket has expired.
  onBack: () => void;
};

type Group = { label: string; branches: PublicBranch[] };

// Branches grouped under their federation, federations in name order, and the
// WSKO-attached ones last: they are the exception, and putting them first would
// make the common case look like the odd one.
function group(branches: PublicBranch[]): Group[] {
  const byFederation = new Map<string, Group>();
  const wsko: PublicBranch[] = [];

  for (const branch of branches) {
    if (!branch.federationId) {
      wsko.push(branch);
      continue;
    }
    const label = branch.federationName || branch.federationId;
    const existing = byFederation.get(branch.federationId);
    if (existing) existing.branches.push(branch);
    else byFederation.set(branch.federationId, { label, branches: [branch] });
  }

  const groups = [...byFederation.values()].sort((a, b) => a.label.localeCompare(b.label));
  for (const g of groups) g.branches.sort((a, b) => a.name.localeCompare(b.name));
  if (wsko.length > 0) {
    wsko.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ label: WSKO, branches: wsko });
  }
  return groups;
}

export function RegisterBranch({ translator, language, onBack }: Props) {
  const [context, setContext] = useState<JoinContext | null>(null);
  const [branches, setBranches] = useState<PublicBranch[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Set when there is no usable ticket: the remedy is to verify the address
  // again, which is a sign-in rather than an error the user can fix here.
  const [ticketLost, setTicketLost] = useState(false);

  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [ctx, list] = await Promise.all([
          getSyncManager().getJoinContext(),
          getSyncManager().listBranches(),
        ]);
        if (ctx === null) {
          setTicketLost(true);
          return;
        }
        setContext(ctx);
        setBranches(list);
        setName(ctx.name);
      } catch {
        setError(translator.translate("Kunde inte hämta klubbarna. Försök igen."));
      } finally {
        setLoaded(true);
      }
    })();
    // The translator changes with the language picker, but re-fetching on that
    // would discard anything already typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => group(branches), [branches]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !branchId) return;

    setBusy(true);
    setError(null);
    try {
      const result = await getSyncManager().submitJoinRequest(branchId, trimmedName, note.trim(), language);
      if (result.ok) {
        const branch = branches.find(b => b.id === branchId);
        setContext(prev => prev && {
          ...prev,
          pending: { branchId, branchName: branch?.name ?? "", createdAt: new Date().toISOString() },
        });
        return;
      }
      switch (result.reason) {
        case "pending":
          // Somebody applied from another tab, or a retry landed twice. Their
          // request exists either way, which is what they wanted.
          setContext(prev => prev && {
            ...prev,
            pending: { branchId, branchName: branches.find(b => b.id === branchId)?.name ?? "", createdAt: "" },
          });
          break;
        case "account_exists":
          setError(translator.translate("Det finns redan ett konto för den här adressen. Logga in i stället."));
          break;
        case "no_ticket":
          setTicketLost(true);
          break;
        default:
          setError(translator.translate("Ansökan kunde inte skickas. Försök igen."));
      }
    } catch (err) {
      setError(err instanceof RateLimitError
        ? translator.translate("För många försök just nu. Vänta en stund och försök igen.")
        : translator.translate("Ansökan kunde inte skickas. Försök igen."));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      await getSyncManager().withdrawJoinRequest();
      setContext(prev => prev && { ...prev, pending: undefined });
    } catch {
      setError(translator.translate("Ansökan kunde inte återkallas. Försök igen."));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return (
      <div className="text-center py-4">
        <Spinner size="sm" className="me-2" />
        {translator.translate("Hämtar klubbar")}…
      </div>
    );
  }

  if (ticketLost) {
    return (
      <>
        <p className="text-body-secondary">
          {translator.translate("Din verifiering har gått ut. Verifiera din e-postadress igen för att ansöka.")}
        </p>
        <div className="d-grid">
          <Button variant="primary" onClick={onBack}>{translator.translate("Tillbaka")}</Button>
        </div>
      </>
    );
  }

  if (context?.pending) {
    return (
      <>
        <h2 className="h5 mb-3">{translator.translate("Din ansökan är inskickad")}</h2>
        <p className="text-body-secondary">
          {translator.translate(
            "Din ansökan om medlemskap i {0} väntar på att godkännas. Du får ett mejl när den har behandlats.",
            { params: [context.pending.branchName] })}
        </p>
        {error !== null && <p className="text-danger">{error}</p>}
        <div className="d-grid gap-2">
          <Button variant="outline-secondary" onClick={() => { void withdraw(); }} disabled={busy}>
            {busy
              ? <><Spinner size="sm" className="me-2" />{translator.translate("Återkalla ansökan")}…</>
              : translator.translate("Återkalla ansökan")}
          </Button>
          <Button variant="link" onClick={onBack}>{translator.translate("Tillbaka")}</Button>
        </div>
      </>
    );
  }

  return (
    <Form onSubmit={(e) => { void submit(e); }}>
      <p className="text-body-secondary">
        {translator.translate("Välj den klubb du tränar i. Klubbens administratörer får avgöra din ansökan.")}
      </p>

      <Form.Group className="mb-3" controlId="registerName">
        <Form.Label>{translator.translate("Ditt namn")}</Form.Label>
        <Form.Control
          value={name}
          onChange={e => { setName(e.target.value); setError(null); }}
          disabled={busy}
          autoFocus
        />
      </Form.Group>

      <Form.Group className="mb-3" controlId="registerBranch">
        <Form.Label>{translator.translate("Klubb")}</Form.Label>
        <Form.Select
          value={branchId}
          onChange={e => { setBranchId(e.target.value); setError(null); }}
          disabled={busy}
        >
          <option value="">{translator.translate("Välj klubb")}…</option>
          {groups.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </optgroup>
          ))}
        </Form.Select>
      </Form.Group>

      <Form.Group className="mb-3" controlId="registerNote">
        <Form.Label>
          {translator.translate("Meddelande till klubben")}{" "}
          <span className="text-body-secondary">({translator.translate("frivilligt")})</span>
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          value={note}
          maxLength={500}
          onChange={e => { setNote(e.target.value); setError(null); }}
          placeholder={translator.translate("T.ex. när du tränar, eller vem som kan känna igen dig.")}
          disabled={busy}
        />
      </Form.Group>

      {error !== null && <p className="text-danger">{error}</p>}

      <div className="d-grid gap-2">
        <Button type="submit" variant="primary" disabled={busy || !name.trim() || !branchId}>
          {busy
            ? <><Spinner size="sm" className="me-2" />{translator.translate("Skicka ansökan")}…</>
            : translator.translate("Skicka ansökan")}
        </Button>
        <Button variant="link" onClick={onBack} disabled={busy}>{translator.translate("Tillbaka")}</Button>
      </div>
    </Form>
  );
}

export default RegisterBranch;
