import { useContext, useEffect, useState } from "react";
import { Badge, Button, Card, Spinner } from "react-bootstrap";
import { TranslatorContext } from "./i18n";
import { getSyncManager } from "./sync/manager";
import { publishPendingRequests } from "./pendingRequests";
import type { AdminJoinRequest } from "./sync/backend";

// The waiting list: everybody who has asked to join a branch this admin
// administers. The route is registered for admins only (see routes.tsx) and the
// backend scopes the listing independently — a branch admin is shown their
// branch's requests because that is all the server returns, not because this
// page filtered them.
const AdminRequests = () => {
  const translator = useContext(TranslatorContext);

  const [requests, setRequests] = useState<AdminJoinRequest[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  // Which denial is awaiting confirmation. Approving is recoverable — the member
  // can be removed later — while a denial sends a message nobody can unsend.
  const [confirmDeny, setConfirmDeny] = useState<string | null>(null);

  const load = async () => {
    setLoadError(false);
    try {
      const waiting = await getSyncManager().adminListRequests();
      setRequests(waiting);
      // This is the one place that knows the true figure, so the menu's badge
      // is corrected from here rather than left to go stale on its own.
      publishPendingRequests(waiting.length);
    } catch {
      setLoadError(true);
    }
  };

  useEffect(() => { void load(); }, []);

  const decide = async (request: AdminJoinRequest, approve: boolean) => {
    setBusyEmail(request.email);
    setError(null);
    try {
      await getSyncManager().adminDecideRequest(request.email, approve);
      const left = (requests ?? []).filter(r => r.email !== request.email);
      setRequests(left);
      publishPendingRequests(left.length);
      setConfirmDeny(null);
    } catch {
      setError(translator.translate("Beslutet kunde inte sparas. Försök igen."));
    } finally {
      setBusyEmail(null);
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

  return (
    <div className="p-3">
      <h1 className="h4 mb-3">{translator.translate("Ansökningar")}</h1>

      {error !== null && <p className="text-danger">{error}</p>}

      {pending.length === 0 ? (
        <p className="text-body-secondary">{translator.translate("Inga ansökningar väntar.")}</p>
      ) : pending.map(request => (
        <Card key={request.email} className="mb-3">
          <Card.Body>
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
              <div>
                <div className="fw-semibold">{request.name}</div>
                <div className="text-body-secondary small">{request.email}</div>
                <div className="text-body-secondary small">{request.branchName}</div>
              </div>
              {request.previouslyDeniedAt !== undefined && request.previouslyDeniedAt !== "" && (
                // Worth saying plainly: a re-application is not the same
                // question as a first one, and the admin should know before
                // deciding rather than after.
                <Badge bg="warning" text="dark">
                  {translator.translate("Har nekats tidigare")}
                </Badge>
              )}
            </div>

            {request.note !== undefined && request.note !== "" && (
              <p className="mt-3 mb-0 border-start border-3 ps-3 text-body-secondary" style={{ whiteSpace: "pre-wrap" }}>
                {request.note}
              </p>
            )}

            <div className="d-flex gap-2 mt-3 flex-wrap">
              {confirmDeny === request.email ? (
                <>
                  <span className="align-self-center me-1">{translator.translate("Neka ansökan?")}</span>
                  <Button size="sm" variant="danger" disabled={busyEmail !== null}
                          onClick={() => { void decide(request, false); }}>
                    {busyEmail === request.email
                      ? <Spinner size="sm" />
                      : translator.translate("Ja, neka")}
                  </Button>
                  <Button size="sm" variant="outline-secondary" disabled={busyEmail !== null}
                          onClick={() => setConfirmDeny(null)}>
                    {translator.translate("Avbryt")}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="primary" disabled={busyEmail !== null}
                          onClick={() => { void decide(request, true); }}>
                    {busyEmail === request.email
                      ? <Spinner size="sm" />
                      : translator.translate("Godkänn")}
                  </Button>
                  <Button size="sm" variant="outline-danger" disabled={busyEmail !== null}
                          onClick={() => setConfirmDeny(request.email)}>
                    {translator.translate("Neka")}
                  </Button>
                </>
              )}
            </div>
          </Card.Body>
        </Card>
      ))}
    </div>
  );
};

export default AdminRequests;
