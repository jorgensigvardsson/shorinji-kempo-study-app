import { useContext, useEffect, useState } from "react";
import { Button, Card, Form, Spinner } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import { TranslatorContext } from "./i18n";
import { getSyncManager } from "./sync/manager";
import type { AdminOrgTree } from "./sync/backend";
import { loadOrganization, orgAuthority } from "./organization";
import { orgWriteRefusal } from "./adminOrgRefusal";
import Loading from "./components/Loading";
import FederationTitle from "./components/FederationTitle";
import BranchList from "./components/BranchList";
import NewBranchForm from "./components/NewBranchForm";

// WSKO, the root of the organization: the federations beneath it, and the
// branches that answer to no federation but to WSKO directly. Open to anyone,
// like the rest of the organization's shape; creating a federation or a
// root-level branch is offered only to those who administer all of WSKO.
//
// WSKO has no stored record and no name to change — "WSKO" is the frontend's own
// label for the root — so unlike a federation's page there is no pencil here.
const AdminWSKO = () => {
  const translator = useContext(TranslatorContext);
  const navigate = useNavigate();
  const { atWSKO, coversBranch } = orgAuthority();

  const [tree, setTree] = useState<AdminOrgTree | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<"branch" | "federation" | null>(null);
  const [newFederationId, setNewFederationId] = useState("");
  const [newFederationName, setNewFederationName] = useState("");

  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const loaded = await loadOrganization();
        if (!current) return;
        setTree(loaded);
        setLoadError(false);
      } catch {
        if (current) setLoadError(true);
      }
    })();
    return () => { current = false; };
  }, [attempt]);

  // A creation is followed by a trip to what was created: an empty federation or
  // branch has nothing to show here, and its own page is where it is filled in.
  const create = (act: () => Promise<string>, pathFor: (id: string) => string) => {
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        navigate(pathFor(await act()));
      } catch (err) {
        setError(orgWriteRefusal(err, translator));
        setBusy(false);
      }
    })();
  };

  const createFederation = () => {
    const id = newFederationId.trim().toUpperCase();
    const name = newFederationName.trim();
    if (id === "" || name === "" || busy) return;
    create(() => getSyncManager().adminCreateFederation(id, name), newId => `/admin/federations/${encodeURIComponent(newId)}`);
  };

  // An omitted federation means WSKO.
  const createBranch = (name: string) =>
    create(() => getSyncManager().adminCreateBranch(name, undefined), newId => `/admin/branches/${encodeURIComponent(newId)}/members`);

  if (loadError) {
    return (
      <div>
        <p className="text-danger">{translator.translate("Kunde inte hämta organisationen.")}</p>
        <Button variant="outline-secondary" onClick={() => { setLoadError(false); setAttempt(n => n + 1); }}>
          {translator.translate("Försök igen")}
        </Button>
      </div>
    );
  }

  if (tree === null) {
    return <Loading />;
  }

  return (
    <div>
      <h1 className="h4 mb-3">WSKO</h1>
      {error !== null && <p className="text-danger">{error}</p>}

      <h2 className="h6 text-body-secondary">{translator.translate("Förbunden")}</h2>
      <Card className="mb-3">
        <Card.Body className="d-flex flex-column gap-2">
          {tree.federations.map(f => (
            <div key={f.id}>
              <Link to={`/admin/federations/${encodeURIComponent(f.id)}`}>
                <FederationTitle id={f.id} name={f.name} />
              </Link>
            </div>
          ))}
        </Card.Body>
      </Card>

      <h2 className="h6 text-body-secondary">{translator.translate("Klubbar direkt under WSKO")}</h2>
      <Card>
        <Card.Body>
          <BranchList translator={translator} branches={tree.wskoBranches} canOpen={b => coversBranch(b.id, "")} />
        </Card.Body>
      </Card>

      {/* Right-aligned under the lists, flush with their edge. An open form
          stands in for both buttons — one thing at a time. */}
      {atWSKO && (
        <div className="mt-3">
          {adding === "branch" && (
            <NewBranchForm translator={translator} busy={busy} onCreate={createBranch} onCancel={() => setAdding(null)} />
          )}
          {adding === "federation" && (
            <div className="d-flex gap-2 flex-wrap align-items-center justify-content-end">
              <Form.Control
                size="sm"
                autoFocus
                style={{ width: "6rem" }}
                value={newFederationId}
                disabled={busy}
                placeholder={translator.translate("Landskod")}
                aria-label={translator.translate("Landskod")}
                onChange={e => setNewFederationId(e.target.value)}
              />
              <Form.Control
                size="sm"
                style={{ maxWidth: "24rem" }}
                value={newFederationName}
                disabled={busy}
                placeholder={translator.translate("Förbundets namn")}
                aria-label={translator.translate("Förbundets namn")}
                onChange={e => setNewFederationName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") createFederation(); }}
              />
              <Button size="sm" variant="primary"
                      disabled={busy || newFederationId.trim() === "" || newFederationName.trim() === ""}
                      onClick={createFederation}>
                {busy ? <Spinner size="sm" /> : translator.translate("Lägg till")}
              </Button>
              <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => setAdding(null)}>
                {translator.translate("Avbryt")}
              </Button>
            </div>
          )}
          {adding === null && (
            <div className="d-flex justify-content-end gap-2">
              <Button size="sm" variant="outline-primary" disabled={busy}
                      onClick={() => { setAdding("federation"); setNewFederationId(""); setNewFederationName(""); setError(null); }}>
                {translator.translate("Nytt förbund")}
              </Button>
              <Button size="sm" variant="outline-primary" disabled={busy}
                      onClick={() => { setAdding("branch"); setError(null); }}>
                {translator.translate("Ny klubb")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminWSKO;
