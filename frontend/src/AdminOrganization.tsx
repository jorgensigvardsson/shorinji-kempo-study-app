import { lazy, Suspense, useContext, useEffect, useState } from "react";
import { Button, Card } from "react-bootstrap";
import { Diagram3, ListUl } from "react-bootstrap-icons";
import { Link } from "react-router-dom";
import { TranslatorContext } from "./i18n";
import type { AdminOrgBranch, AdminOrgTree } from "./sync/backend";
import { loadOrganization, orgAuthority } from "./organization";
import Loading from "./components/Loading";
import FederationTitle from "./components/FederationTitle";
import BranchList from "./components/BranchList";

// Loaded only when somebody actually opens the tree view, not with the rest of
// this page. @xyflow/react is the single heaviest dependency in the app, and
// this page's own chunk is fetched for everyone the moment the app goes idle
// (see routes.tsx, preloadPages) — that preload must not also drag in a
// diagramming library on behalf of somebody who never leaves the list view.
const AdminOrganizationTree = lazy(() => import("./AdminOrganizationTree"));

// Which view this reader last chose, kept per device like the theme preference
// (persistence/theme.ts) — not because two views ever disagree the way two
// devices can, but because the component unmounts on every navigation away
// from this page (opening a federation, for instance) and remounts with fresh
// state on the way back. Without this, "list" was the only view that could
// ever survive a click through to somewhere else and back.
const VIEW_STORAGE_KEY = "admin-organization-view";

function readStoredView(): "list" | "tree" {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "tree" ? "tree" : "list";
  } catch {
    return "list";
  }
}

// WSKO is the root of the organization rather than a record with a name, so it
// has no id: on the wire a branch attached to it simply carries no federation.
export interface Section {
  federationId: string; // "" for WSKO
  title: string;
  branches: AdminOrgBranch[];
}

// The organization, as anyone may see it: every federation and every branch.
// Nothing here changes anything. Each federation, and WSKO, is a link to a page
// of its own, which is where renaming and adding happen for those allowed to;
// each branch is a link to its members for those who administer it. A page of
// the whole with a button per thing on it was mostly buttons.
const AdminOrganization = () => {
  const translator = useContext(TranslatorContext);
  const { coversBranch } = orgAuthority();

  const [tree, setTree] = useState<AdminOrgTree | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [view, setViewState] = useState<"list" | "tree">(readStoredView);
  const setView = (next: "list" | "tree") => {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Storage full or blocked: the choice still holds for this visit.
    }
  };

  // Bumped to ask again: a retry re-runs the effect rather than firing a second
  // request beside it, so there is one place where the fetching happens.
  const [attempt, setAttempt] = useState(0);

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

  // WSKO last: the federations are where nearly every branch lives, and the
  // handful attached directly to the root read better as the tail of the list
  // than as a preamble to it. It is always there, empty or not — it is the
  // root, and the way to its own page.
  const sections: Section[] = [
    ...tree.federations.map(f => ({ federationId: f.id, title: f.name, branches: f.branches })),
    { federationId: "", title: "WSKO", branches: tree.wskoBranches },
  ];

  const canOpenBranch = (branch: AdminOrgBranch, federationId: string) => coversBranch(branch.id, federationId);

  return (
    <div>
      <p className="text-secondary">
        {translator.translate("Förbund och klubbar. En klubb hör antingen till ett förbund eller direkt till WSKO.")}
      </p>

      {/* The tree's own chunk, not a service: a wait for it is the app fetching its
          own code, and has nothing to do with anything starting up. */}
      {view === "tree" && (
        <Suspense fallback={<Loading fromService={false} className="p-3" />}>
          <AdminOrganizationTree sections={sections} canOpenBranch={canOpenBranch} />
        </Suspense>
      )}

      {view === "list" && sections.map(section => (
        <Card key={section.federationId === "" ? "wsko" : section.federationId} className="mb-3">
          <Card.Header className="fw-semibold">
            {section.federationId === ""
              ? <Link to="/admin/wsko">WSKO</Link>
              : (
                <Link to={`/admin/federations/${encodeURIComponent(section.federationId)}`}>
                  <FederationTitle id={section.federationId} name={section.title} />
                </Link>
              )}
          </Card.Header>
          <Card.Body>
            <BranchList translator={translator} branches={section.branches}
                        canOpen={b => canOpenBranch(b, section.federationId)} />
          </Card.Body>
        </Card>
      ))}

      {/* Under the organization rather than above it, right-aligned with its
          edge: which way to draw it is a second thought after what is drawn. */}
      <div role="group" aria-label={translator.translate("Vy")} className="d-flex justify-content-end gap-1">
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
  );
};

export default AdminOrganization;
