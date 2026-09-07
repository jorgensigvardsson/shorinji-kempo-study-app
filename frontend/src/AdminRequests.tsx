import { useContext, useEffect, useState, type ReactNode } from "react";
import { Badge, Button, Card, Spinner } from "react-bootstrap";
import { TranslatorContext, type Translator } from "./i18n";
import { getSyncManager } from "./sync/manager";
import { loadAdminQueue, setAdminQueue } from "./pendingRequests";
import { AdminRequestError, type AdminJoinRequest, type AdminTransfer } from "./sync/backend";
import Loading from "./components/Loading";

// How long to wait before the one quiet retry a rate-limited decision gets. A
// refusal for rate means the request never reached the handler, so repeating it
// cannot decide anything twice — and the app's own burstiness is the usual
// reason for one, which a moment's pause is enough to clear.
const RETRY_AFTER_MS = 800;

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

  // `fresh` goes past the reading the menu badge may have taken moments ago,
  // which is what a retry and a re-read after a failure both want.
  const load = async (fresh = false) => {
    setLoadError(false);
    try {
      const queue = await loadAdminQueue({ fresh });
      setRequests(queue.requests);
      setTransfers(queue.transfers);
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
      await decideWithRetry(act);
      const queue = {
        requests: (requests ?? []).filter(r => r.email !== id),
        transfers: (transfers ?? []).filter(t => t.id !== id),
      };
      setRequests(queue.requests);
      setTransfers(queue.transfers);
      // The row is gone for certain, so nobody needs to be sent to ask — and the
      // menu's count is corrected from here rather than left to go stale.
      setAdminQueue(queue);
      setConfirmDeny(null);
    } catch (err) {
      setError(refusal(err, translator));
      // A request the server no longer has is one somebody else has already
      // dealt with, so what is on screen is wrong and re-reading is the answer.
      // Nothing else re-reads: after a refusal for rate, two more calls are the
      // last thing the situation needs.
      if (err instanceof AdminRequestError && err.status === 404) void load(true);
    } finally {
      setBusyId(null);
    }
  };

  if (requests === null && !loadError) {
    return <Loading className="p-3" label={`${translator.translate("Hämtar ansökningar")}…`} />;
  }

  if (loadError) {
    return (
      <div className="p-3">
        <p className="text-danger">{translator.translate("Kunde inte hämta ansökningarna.")}</p>
        <Button variant="outline-secondary" onClick={() => { void load(true); }}>
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

// Runs a decision, giving it one more go if the server refused it for rate. The
// per-IP ceiling is shared by everyone in a household and spent by the app itself
// on every page it opens, so a click can arrive to find nothing left — a
// circumstance the admin neither caused nor can do anything about. Waiting a
// moment and trying again is what she would have done herself.
const decideWithRetry = async (act: () => Promise<void>): Promise<void> => {
  try {
    await act();
  } catch (err) {
    if (!(err instanceof AdminRequestError) || err.status !== 429) throw err;
    await new Promise(resolve => setTimeout(resolve, RETRY_AFTER_MS));
    await act();
  }
};

// Turns a refusal into something worth reading. The distinction matters: "wait a
// moment" and "somebody else got there first" ask opposite things of whoever is
// looking, and for a long while both of them read "try again" — which is how a
// rate limit came to look like a broken page.
const refusal = (err: unknown, translator: Translator): string => {
  const status = err instanceof AdminRequestError ? err.status : 0;
  if (status === 429) return translator.translate("För många på kort tid. Vänta en stund och försök igen.");
  if (status === 404) return translator.translate("Ansökan finns inte längre — någon annan kan ha hunnit före.");
  return translator.translate("Beslutet kunde inte sparas. Försök igen.");
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
