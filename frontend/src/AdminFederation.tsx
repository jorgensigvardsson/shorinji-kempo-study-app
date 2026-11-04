import { useContext, useEffect, useState } from "react";
import { Button, Card } from "react-bootstrap";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TranslatorContext } from "./i18n";
import { getSyncManager } from "./sync/manager";
import type { AdminOrgFederation } from "./sync/backend";
import { loadOrganization, orgAuthority } from "./organization";
import { orgWriteRefusal } from "./adminOrgRefusal";
import Loading from "./components/Loading";
import FederationTitle from "./components/FederationTitle";
import BranchList from "./components/BranchList";
import NewBranchForm from "./components/NewBranchForm";
import RenamePencil from "./components/RenamePencil";
import InlineNameEditor from "./components/InlineNameEditor";

// One federation and its branches, open to anyone, like the rest of the
// organization's shape. This is also where a federation is changed — renamed,
// or given a new branch — by those who administer it, so the overview can stay
// a picture of the whole rather than a row of buttons per federation.
//
// There is no endpoint for a single federation: the organization is small, so
// it is loaded whole and the federation picked out of it.
const AdminFederation = () => {
  const translator = useContext(TranslatorContext);
  const navigate = useNavigate();
  const { id = "" } = useParams<{ id: string }>();
  const authority = orgAuthority();
  // A branch admin sees the federation their branch is in like anybody does,
  // but changing it is a federation-level act.
  const covers = authority.coversFederation(id);

  const [federation, setFederation] = useState<AdminOrgFederation | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [addingBranch, setAddingBranch] = useState(false);

  // As on the branch page: the effect owns the fetching, and a navigation to
  // another federation abandons the answer about the previous one.
  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const found = (await loadOrganization()).federations.find(f => f.id === id) ?? null;
        if (!current) return;
        setFederation(found);
        setMissing(found === null);
        setLoadError(false);
      } catch {
        if (current) setLoadError(true);
      }
    })();
    return () => { current = false; };
  }, [id, attempt]);

  // Every write is followed by a reload rather than a local patch: the server
  // decides ids, ordering and what this caller may see.
  const write = async <T,>(act: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      const result = await act();
      setFederation((await loadOrganization()).federations.find(f => f.id === id) ?? null);
      return result;
    } catch (err) {
      setError(orgWriteRefusal(err, translator));
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const saveRename = (name: string) => {
    void (async () => {
      if (await write(async () => { await getSyncManager().adminRenameFederation(id, name); return true; })) {
        setRenaming(false);
      }
    })();
  };

  // A new branch has nobody in it and nothing else to see from here, so the
  // admin is taken straight to it — that is where its first members are added.
  const createBranch = (name: string) => {
    void (async () => {
      const newId = await write(() => getSyncManager().adminCreateBranch(name, id));
      if (newId !== undefined) navigate(`/admin/branches/${encodeURIComponent(newId)}/members`);
    })();
  };

  if (missing) {
    return (
      <div>
        <p className="text-body-secondary">{translator.translate("Det här förbundet finns inte, eller så har du inte behörighet till det.")}</p>
        <Link to="/admin/organization">{translator.translate("Till organisationen")}</Link>
      </div>
    );
  }

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

  if (federation === null) {
    return <Loading />;
  }

  return (
    <div>
      {renaming ? (
        <div className="mb-3">
          <InlineNameEditor translator={translator} initial={federation.name} busy={busy}
                            onSave={saveRename} onCancel={() => setRenaming(false)} />
        </div>
      ) : (
        <div className="d-flex align-items-center gap-1 mb-3">
          <h1 className="h4 mb-0"><FederationTitle id={federation.id} name={federation.name} /></h1>
          {covers && (
            <RenamePencil translator={translator} disabled={busy}
                          onClick={() => { setRenaming(true); setError(null); }} />
          )}
        </div>
      )}

      {error !== null && <p className="text-danger">{error}</p>}

      <Card>
        <Card.Body>
          <BranchList translator={translator} branches={federation.branches}
                      canOpen={b => authority.coversBranch(b.id, federation.id)} />
        </Card.Body>
      </Card>

      {/* Right-aligned under the list, flush with its edge. While the form is
          open its button is gone — the form is the answer to it. */}
      {covers && (
        <div className="mt-3">
          {addingBranch
            ? <NewBranchForm translator={translator} busy={busy} onCreate={createBranch}
                             onCancel={() => setAddingBranch(false)} />
            : (
              <div className="d-flex justify-content-end">
                <Button size="sm" variant="outline-primary" disabled={busy}
                        onClick={() => { setAddingBranch(true); setError(null); }}>
                  {translator.translate("Ny klubb")}
                </Button>
              </div>
            )}
        </div>
      )}
    </div>
  );
};

export default AdminFederation;
