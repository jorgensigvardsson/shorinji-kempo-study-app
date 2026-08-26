import { useContext, useEffect, useState, type ReactNode } from "react";
import { Badge, Button, Card, Spinner } from "react-bootstrap";
import { TranslatorContext, type Translator } from "./i18n";
import { getSyncManager } from "./sync/manager";
import { publishPendingRequests } from "./pendingRequests";
import type { AdminJoinRequest, AdminTransfer } from "./sync/backend";

// Everybody waiting on this admin: people asking to be let in, and members who
// have moved and are asking a club to take them over. The route is registered
// for admins only (see routes.tsx) and the backend scopes both listings
// independently — a branch admin is shown their branch's, because that is all
// the server returns, not because this page filtered them.
const AdminRequests = () => {
  const translator = useContext(TranslatorContext);

  const [requests, setRequests] = useState<AdminJoinRequest[] | null>(null);
  const [transfers, setTransfers] = useState<AdminTransfer[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Which refusal is awaiting confirmation. Approving is recoverable — a member
  // can be moved or removed later — while a refusal sends a message nobody can
  // unsend.
  const [confirmDeny, setConfirmDeny] = useState<string | null>(null);

  const load = async () => {
    setLoadError(false);
    try {
      const [waiting, moving] = await Promise.all([
        getSyncManager().adminListRequests(),
        getSyncManager().adminListTransfers(),
      ]);
      setRequests(waiting);
      setTransfers(moving);
      // This is the one place that knows the true figure, so the menu's count is
      // corrected from here rather than left to go stale on its own.
      publishPendingRequests(waiting.length + moving.length);
    } catch {
      setLoadError(true);
    }
  };

  useEffect(() => { void load(); }, []);

  // Both decisions have the same shape: act, drop the row, correct the count.
  const decide = async (id: string, act: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await act();
      const waiting = (requests ?? []).filter(r => r.email !== id);
      const moving = (transfers ?? []).filter(t => t.id !== id);
      setRequests(waiting);
      setTransfers(moving);
      publishPendingRequests(waiting.length + moving.length);
      setConfirmDeny(null);
    } catch {
      setError(translator.translate("Beslutet kunde inte sparas. Försök igen."));
    } finally {
      setBusyId(null);
    }
  };

  if (requests === null && !loadError) {
    return <div className="p-3"><Spinner size="sm" className="me-2" />{translator.translate("Hämtar ansökningar")}…</div>;
  }

  if (loadError) {
    return (
      <div className="p-3">
        <p className="text-danger">{translator.translate("Kunde inte hämta ansökningarna.")}</p>
        <Button variant="outline-secondary" onClick={() => { void load(); }}>
          {translator.translate("Försök igen")}
        </Button>
      </div>
    );
  }

  const pending = requests ?? [];
  const moving = transfers ?? [];

  return (
    <div className="p-3">
      <h1 className="h4 mb-3">{translator.translate("Ansökningar")}</h1>

      {error !== null && <p className="text-danger">{error}</p>}

      {pending.length === 0 && moving.length === 0 && (
        <p className="text-body-secondary">{translator.translate("Inga ansökningar väntar.")}</p>
      )}

      {pending.length > 0 && (
        <>
          <h2 className="h6 text-body-secondary">{translator.translate("Nya medlemmar")}</h2>
          {pending.map(request => (
            <DecisionCard
              key={request.email}
              translator={translator}
              title={request.name}
              subtitle={request.email}
              detail={request.branchName}
              note={request.note}
              declinedBefore={request.previouslyDeniedAt}
              busy={busyId !== null}
              deciding={busyId === request.email}
              confirming={confirmDeny === request.email}
              onConfirm={() => setConfirmDeny(request.email)}
              onCancel={() => setConfirmDeny(null)}
              onDecide={approve => {
                void decide(request.email, () => getSyncManager().adminDecideRequest(request.email, approve));
              }}
            />
          ))}
        </>
      )}

      {moving.length > 0 && (
        <>
          <h2 className="h6 text-body-secondary mt-4">{translator.translate("Byte av klubb")}</h2>
          {moving.map(transfer => (
            <DecisionCard
              key={transfer.id}
              translator={translator}
              title={transfer.memberName}
              subtitle={transfer.memberEmail}
              // Where they are coming from is the thing worth reading here: this
              // is somebody a club already knows, not a stranger at the door.
              detail={transfer.fromBranchName !== undefined && transfer.fromBranchName !== ""
                ? `${transfer.fromBranchName} → ${transfer.toBranchName}`
                : transfer.toBranchName}
              note={transfer.note}
              declinedBefore={transfer.previouslyRejectedAt}
              busy={busyId !== null}
              deciding={busyId === transfer.id}
              confirming={confirmDeny === transfer.id}
              onConfirm={() => setConfirmDeny(transfer.id)}
              onCancel={() => setConfirmDeny(null)}
              onDecide={accept => {
                void decide(transfer.id, () => getSyncManager().adminDecideTransfer(transfer.id, accept));
              }}
            />
          ))}
        </>
      )}
    </div>
  );
};

// One person waiting on a yes or a no. Both kinds of request are read the same
// way — who, from where, in their own words — and decided with the same two
// buttons, so they are drawn by the same component rather than by two that would
// drift apart.
const DecisionCard = ({
  translator, title, subtitle, detail, note, declinedBefore,
  busy, deciding, confirming, onConfirm, onCancel, onDecide,
}: {
  translator: Translator;
  title: string;
  subtitle: string;
  detail: ReactNode;
  note?: string;
  declinedBefore?: string;
  busy: boolean;
  deciding: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDecide: (approve: boolean) => void;
}) => (
  <Card className="mb-3">
    <Card.Body>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <div className="fw-semibold">{title}</div>
          <div className="text-body-secondary small">{subtitle}</div>
          <div className="text-body-secondary small">{detail}</div>
        </div>
        {declinedBefore !== undefined && declinedBefore !== "" && (
          // Worth saying plainly: a second ask is not the same question as a
          // first one, and whoever decides should know before rather than after.
          <Badge bg="warning" text="dark">
            {translator.translate("Har nekats tidigare")}
          </Badge>
        )}
      </div>

      {note !== undefined && note !== "" && (
        <p className="mt-3 mb-0 border-start border-3 ps-3 text-body-secondary" style={{ whiteSpace: "pre-wrap" }}>
          {note}
        </p>
      )}

      <div className="d-flex gap-2 mt-3 flex-wrap">
        {confirming ? (
          <>
            <span className="align-self-center me-1">{translator.translate("Neka ansökan?")}</span>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => onDecide(false)}>
              {deciding ? <Spinner size="sm" /> : translator.translate("Ja, neka")}
            </Button>
            <Button size="sm" variant="outline-secondary" disabled={busy} onClick={onCancel}>
              {translator.translate("Avbryt")}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => onDecide(true)}>
              {deciding ? <Spinner size="sm" /> : translator.translate("Godkänn")}
            </Button>
            <Button size="sm" variant="outline-danger" disabled={busy} onClick={onConfirm}>
              {translator.translate("Neka")}
            </Button>
          </>
        )}
      </div>
    </Card.Body>
  </Card>
);

export default AdminRequests;
