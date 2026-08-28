import { lazy, Suspense, useContext, useEffect, useState } from "react";
import { Badge, Button, Card, Form, Modal, Spinner } from "react-bootstrap";
import { Diagram3, ListUl } from "react-bootstrap-icons";
import { Link } from "react-router-dom";
import { TranslatorContext } from "./i18n";
import { getSyncManager } from "./sync/manager";
import { AdminRequestError, type AdminOrgBranch, type AdminOrgTree } from "./sync/backend";
import { administeredBranches, administeredFederations, coversEverything } from "./roles";
import Loading from "./components/Loading";

// Loaded only when somebody actually opens the tree view, not with the rest of
// this page. @xyflow/react is the single heaviest dependency in the app, and
// this page's own chunk is fetched for every admin the moment the app goes
// idle (see routes.tsx, preloadPages) — that preload must not also drag in a
// diagramming library on behalf of an admin who never leaves the list view.
const AdminOrganizationTree = lazy(() => import("./AdminOrganizationTree"));

// WSKO is the root of the organization rather than a record with a name, so it
// has no id: on the wire a branch attached to it simply carries no federation.
// The heading is this page's to supply, and it is a heading rather than an
// absence — a branch under no federation has a place, and saying so is the whole
// difference between "belongs to WSKO" and "looks like it got lost".
const WSKO = "";

// Which view this admin last chose, kept per device like the theme preference
// (persistence/theme.ts) — not because two views ever disagree the way two
// devices can, but because the component unmounts on every navigation away
// from this page (opening a branch's members, for instance) and remounts
// with fresh state on the way back. Without this, "list" was the only view
// that could ever survive a click through to somewhere else and back.
const VIEW_STORAGE_KEY = "admin-organization-view";

function readStoredView(): "list" | "tree" {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "tree" ? "tree" : "list";
  } catch {
    return "list";
  }
}

interface Section {
  federationId: string; // "" for WSKO
  title: string;
  branches: AdminOrgBranch[];
}

// The organization as its administrators see and shape it. Every control here is
// offered on what the caller's roles cover, and refused again by the server on
// what they actually cover — this file decides what to show, not what is allowed.
const AdminOrganization = () => {
  const translator = useContext(TranslatorContext);
  const roles = getSyncManager().getBackendUserInfo()?.roles ?? [];

  // Authority over WSKO itself: creating federations, and anything touching a
  // branch that hangs directly from the root.
  const atWSKO = coversEverything(roles);
  const ownFederations = administeredFederations(roles);
  const ownBranches = administeredBranches(roles);

  const coversFederation = (id: string) =>
    id === WSKO ? atWSKO : atWSKO || ownFederations.includes(id);
  // A branch is covered through its federation as well as directly, which is why
  // the federation it sits in is part of the question.
  const coversBranch = (branch: AdminOrgBranch, federationId: string) =>
    coversFederation(federationId) || ownBranches.includes(branch.id);

  const [tree, setTree] = useState<AdminOrgTree | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setViewState] = useState<"list" | "tree">(readStoredView);
  const setView = (next: "list" | "tree") => {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Storage full or blocked: the choice still holds for this visit.
    }
  };

  // The id the tree view should pan itself to once it next has somewhere to
  // put it — set right after creating a federation or branch, cleared by the
  // tree once it has acted on it. A newly created thing is, almost by
  // definition, off in a part of the canvas nobody was already looking at.
  const [focusId, setFocusId] = useState<string | null>(null);

  // Which thing is being renamed, and to what. One at a time: renaming is rare
  // enough that a second open editor would be clutter rather than convenience.
  const [editing, setEditing] = useState<{ kind: "federation" | "branch"; id: string } | null>(null);
  const [editName, setEditName] = useState("");

  // Which federation (or WSKO) has its "add a branch" form open.
  const [addingBranchIn, setAddingBranchIn] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState("");

  const [addingFederation, setAddingFederation] = useState(false);
  const [newFederationId, setNewFederationId] = useState("");
  const [newFederationName, setNewFederationName] = useState("");

  // The branch whose federation is being changed, and where to. Moving one is
  // rare, irreversible from the destination's side, and changes who may see its
  // members — so it is asked for in a dialog and confirmed, rather than being a
  // dropdown that acts on the way past.
  const [moving, setMoving] = useState<{ branch: AdminOrgBranch; from: string } | null>(null);
  const [moveTo, setMoveTo] = useState(WSKO);

  const load = async () => {
    setLoadError(false);
    try {
      setTree(await getSyncManager().adminOrgTree());
    } catch {
      setLoadError(true);
    }
  };

  useEffect(() => { void load(); }, []);

  // Every write is followed by a reload rather than a local patch. The server
  // decides ids, ordering and what this caller may see, and a page that guessed
  // at those would drift from it in exactly the cases that matter.
  //
  // Generic over the result so a caller that creates something — the only
  // writes with anything worth reporting back — can act on what the server
  // handed back, without every other write needing to care that it exists.
  const write = async <T,>(act: () => Promise<T>, done?: (result: T) => void) => {
    setBusy(true);
    setError(null);
    try {
      const result = await act();
      done?.(result);
      await load();
    } catch (err) {
      setError(refusal(err));
    } finally {
      setBusy(false);
    }
  };

  const refusal = (err: unknown): string => {
    if (err instanceof AdminRequestError) {
      if (err.status === 403) return translator.translate("Du har inte behörighet att göra det.");
      if (err.status === 409) return translator.translate("Det finns redan ett förbund med den koden.");
      if (err.status === 400) return translator.translate("Uppgifterna kunde inte godtas. Kontrollera dem och försök igen.");
    }
    return translator.translate("Ändringen kunde inte sparas. Försök igen.");
  };

  const startRename = (kind: "federation" | "branch", id: string, name: string) => {
    setEditing({ kind, id });
    setEditName(name);
    setError(null);
  };

  const saveRename = () => {
    if (editing === null) return;
    const name = editName.trim();
    if (name === "") return;
    const { kind, id } = editing;
    void write(
      () => kind === "federation"
        ? getSyncManager().adminRenameFederation(id, name)
        : getSyncManager().adminUpdateBranch(id, { name }),
      () => setEditing(null));
  };

  const createBranch = (federationId: string) => {
    const name = newBranchName.trim();
    if (name === "") return;
    // An omitted federation means WSKO — passing "" would be the same request,
    // but the client's signature says "no federation" with undefined.
    void write(
      () => getSyncManager().adminCreateBranch(name, federationId === WSKO ? undefined : federationId),
      (newId) => { setAddingBranchIn(null); setNewBranchName(""); setFocusId(newId); });
  };

  const createFederation = () => {
    const id = newFederationId.trim().toUpperCase();
    const name = newFederationName.trim();
    if (id === "" || name === "") return;
    void write(
      () => getSyncManager().adminCreateFederation(id, name),
      (newId) => { setAddingFederation(false); setNewFederationId(""); setNewFederationName(""); setFocusId(newId); });
  };

  const startMove = (branch: AdminOrgBranch, from: string) => {
    setMoving({ branch, from });
    // Opening on where it already is means the confirm button starts disabled:
    // the dialog asks a question rather than proposing an answer.
    setMoveTo(from);
    setError(null);
  };

  const confirmMove = () => {
    if (moving === null || moveTo === moving.from) return;
    // "" is a real destination here, not a missing one: it moves the branch out
    // of its federation and up to WSKO.
    void write(
      () => getSyncManager().adminUpdateBranch(moving.branch.id, { federationId: moveTo }),
      () => setMoving(null));
  };

  if (tree === null && !loadError) {
    return <Loading />;
  }

  if (loadError) {
    return (
      <div>
        <p className="text-danger">{translator.translate("Kunde inte hämta organisationen.")}</p>
        <Button variant="outline-secondary" onClick={() => { void load(); }}>
          {translator.translate("Försök igen")}
        </Button>
      </div>
    );
  }

  const federations = tree?.federations ?? [];
  const wskoBranches = tree?.wskoBranches ?? [];

  // WSKO last: the federations are where nearly every branch lives, and the
  // handful attached directly to the root read better as the tail of the list
  // than as a preamble to it.
  const sections: Section[] = [
    ...federations.map(f => ({ federationId: f.id, title: f.name, branches: f.branches })),
    ...(wskoBranches.length > 0 || atWSKO
      ? [{ federationId: WSKO, title: "WSKO", branches: wskoBranches }]
      : []),
  ];

  // Where a branch may be moved to. Only offered to someone covering WSKO: a
  // move is a departure and an arrival, and the server requires authority over
  // both — which no federation admin has for anywhere but their own federation.
  const destinations = [
    ...federations.map(f => ({ id: f.id, label: `${f.name} (${f.id})` })),
    { id: WSKO, label: "WSKO" },
  ];

  const renameControls = () => (
    <div className="d-flex gap-2 flex-grow-1" style={{ maxWidth: "28rem" }}>
      <Form.Control
        size="sm"
        autoFocus
        value={editName}
        disabled={busy}
        aria-label={translator.translate("Namn")}
        onChange={e => setEditName(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") saveRename(); }}
      />
      <Button size="sm" variant="primary" disabled={busy || editName.trim() === ""} onClick={saveRename}>
        {busy ? <Spinner size="sm" /> : translator.translate("Spara")}
      </Button>
      <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => setEditing(null)}>
        {translator.translate("Avbryt")}
      </Button>
    </div>
  );

  const isEditing = (kind: "federation" | "branch", id: string) =>
    editing !== null && editing.kind === kind && editing.id === id;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
        <p className="text-secondary">
          {translator.translate("Förbund och klubbar. En klubb hör antingen till ett förbund eller direkt till WSKO.")}
        </p>
        <div role="group" aria-label={translator.translate("Vy")} className="d-flex gap-1">
          <Button size="sm" variant={view === "list" ? "primary" : "outline-secondary"}
                  aria-pressed={view === "list"} onClick={() => setView("list")}>
            <ListUl className="me-1" />{translator.translate("Lista")}
          </Button>
          <Button size="sm" variant={view === "tree" ? "primary" : "outline-secondary"}
                  aria-pressed={view === "tree"} onClick={() => setView("tree")}>
            <Diagram3 className="me-1" />{translator.translate("Träd")}
          </Button>
        </div>
      </div>

      {error !== null && <p className="text-danger">{error}</p>}

      {/* The tree's own chunk, not a service: a wait for it is the app fetching its
          own code, and has nothing to do with anything starting up. */}
      {view === "tree" && (
        <Suspense fallback={<Loading fromService={false} className="p-3" />}>
          <AdminOrganizationTree
            translator={translator}
            sections={sections}
            atWSKO={atWSKO}
            coversFederation={coversFederation}
            coversBranch={coversBranch}
            busy={busy}
            isEditing={isEditing}
            renameControls={renameControls}
            startRename={startRename}
            addingBranchIn={addingBranchIn}
            newBranchName={newBranchName}
            setNewBranchName={setNewBranchName}
            setAddingBranchIn={setAddingBranchIn}
            setError={setError}
            createBranch={createBranch}
            startMove={startMove}
            focusId={focusId}
            onFocused={() => setFocusId(null)}
          />
        </Suspense>
      )}

      {view === "list" && sections.map(section => (
        <Card key={section.federationId === WSKO ? "wsko" : section.federationId} className="mb-3">
          <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            {isEditing("federation", section.federationId)
              ? renameControls()
              : (
                <>
                  <span className="fw-semibold">
                    {section.title}
                    {section.federationId !== WSKO && (
                      <Badge bg="secondary" className="ms-2">{section.federationId}</Badge>
                    )}
                  </span>
                  <div className="d-flex gap-2">
                    {section.federationId !== WSKO && coversFederation(section.federationId) && (
                      <Button size="sm" variant="outline-secondary" disabled={busy}
                              onClick={() => startRename("federation", section.federationId, section.title)}>
                        {translator.translate("Byt namn")}
                      </Button>
                    )}
                    {coversFederation(section.federationId) && (
                      <Button size="sm" variant="outline-primary" disabled={busy}
                              onClick={() => { setAddingBranchIn(section.federationId); setNewBranchName(""); setError(null); }}>
                        {translator.translate("Ny klubb")}
                      </Button>
                    )}
                  </div>
                </>
              )}
          </Card.Header>

          <Card.Body className="d-flex flex-column gap-2">
            {section.branches.length === 0 && addingBranchIn !== section.federationId && (
              <span className="text-body-secondary">{translator.translate("Inga klubbar här.")}</span>
            )}

            {section.branches.map(branch => (
              <div key={branch.id} className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                {isEditing("branch", branch.id)
                  ? renameControls()
                  : (
                    <>
                      <Link to={`/admin/branches/${encodeURIComponent(branch.id)}/members`}>{branch.name}</Link>
                      <div className="d-flex gap-2 align-items-center">
                        {coversBranch(branch, section.federationId) && (
                          <Button size="sm" variant="outline-secondary" disabled={busy}
                                  onClick={() => startRename("branch", branch.id, branch.name)}>
                            {translator.translate("Byt namn")}
                          </Button>
                        )}
                        {atWSKO && (
                          <Button size="sm" variant="outline-danger" disabled={busy}
                                  onClick={() => startMove(branch, section.federationId)}>
                            {translator.translate("Byt förbund")}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
              </div>
            ))}

            {addingBranchIn === section.federationId && (
              <div className="d-flex gap-2 flex-wrap align-items-center">
                <Form.Control
                  size="sm"
                  autoFocus
                  style={{ maxWidth: "20rem" }}
                  value={newBranchName}
                  disabled={busy}
                  placeholder={translator.translate("Klubbens namn")}
                  aria-label={translator.translate("Klubbens namn")}
                  onChange={e => setNewBranchName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") createBranch(section.federationId); }}
                />
                <Button size="sm" variant="primary" disabled={busy || newBranchName.trim() === ""}
                        onClick={() => createBranch(section.federationId)}>
                  {busy ? <Spinner size="sm" /> : translator.translate("Lägg till")}
                </Button>
                <Button size="sm" variant="outline-secondary" disabled={busy}
                        onClick={() => setAddingBranchIn(null)}>
                  {translator.translate("Avbryt")}
                </Button>
              </div>
            )}
          </Card.Body>
        </Card>
      ))}

      {/* Federations are peers of each other, so creating one is a WSKO-level act
          — no federation admin is above another. */}
      {atWSKO && (addingFederation ? (
        <Card className="mb-3">
          <Card.Body className="d-flex gap-2 flex-wrap align-items-center">
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
            <Button size="sm" variant="outline-secondary" disabled={busy}
                    onClick={() => setAddingFederation(false)}>
              {translator.translate("Avbryt")}
            </Button>
          </Card.Body>
        </Card>
      ) : (
        <Button variant="outline-primary" disabled={busy} onClick={() => { setAddingFederation(true); setError(null); }}>
          {translator.translate("Nytt förbund")}
        </Button>
      ))}

      {/* A branch's federation decides who administers its members, so changing
          it hands those members to a different set of people. That is worth a
          deliberate act rather than a stray keystroke in a list. */}
      <Modal show={moving !== null} onHide={() => setMoving(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="h5">{translator.translate("Byt förbund")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* The club's own name, never translated — like every organization name. */}
          <p className="fw-semibold mb-1">{moving?.branch.name}</p>
          <p className="text-body-secondary">
            {translator.translate("Att flytta en klubb till ett annat förbund ändrar vilka administratörer som kan se dess medlemmar.")}
          </p>
          <Form.Group controlId="moveBranchDestination">
            <Form.Label>{translator.translate("Flytta till")}</Form.Label>
            <Form.Select value={moveTo} disabled={busy} onChange={e => setMoveTo(e.target.value)}>
              {destinations.map(d => (
                <option key={d.id === WSKO ? "wsko" : d.id} value={d.id}>{d.label}</option>
              ))}
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={busy} onClick={() => setMoving(null)}>
            {translator.translate("Avbryt")}
          </Button>
          {/* Disabled until the destination actually differs: confirming a move
              to where the branch already is would be a write that reads as one. */}
          <Button variant="danger" disabled={busy || moving === null || moveTo === moving.from}
                  onClick={confirmMove}>
            {busy ? <Spinner size="sm" /> : translator.translate("Flytta klubben")}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default AdminOrganization;
