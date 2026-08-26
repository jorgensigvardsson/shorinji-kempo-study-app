import { useContext, useEffect, useMemo, useState } from "react";
import { Button, Card, Form, Spinner } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import { TranslatorContext } from "./i18n";
import { getSyncManager } from "./sync/manager";
import { AdminRequestError, type AdminBranchMembers as Branch } from "./sync/backend";
import { ROLE_ADMIN, ROLE_WSKO_ADMIN, branchAdmin, federationAdmin } from "./roles";

// One branch's members. This is what replaced the flat roll of everybody: a club
// of a hundred is a page you can read, and the branch next door is not on it.
const AdminBranchMembers = () => {
  const translator = useContext(TranslatorContext);
  const { id = "" } = useParams<{ id: string }>();

  const [branch, setBranch] = useState<Branch | null>(null);
  // A branch outside the caller's authority answers exactly as one that does not
  // exist, so there is one message for both — the page could not tell them apart
  // even if it wanted to.
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState("");
  // Bumped to ask again. A retry re-runs the effect rather than firing a second
  // request beside it, so there is one place where the fetching happens.
  const [attempt, setAttempt] = useState(0);

  // The fetch lives in the effect so that moving to another branch can abandon
  // the answer to the previous one: two navigations in quick order must not let
  // the slower reply land on top of the newer branch. Nothing is cleared before
  // the request goes out either — the flags settle on the answer rather than on
  // the asking.
  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const fetched = await getSyncManager().adminBranchMembers(id);
        if (!current) return;
        setBranch(fetched);
        setLoadError(false);
        setMissing(false);
      } catch (err) {
        if (!current) return;
        const notThere = err instanceof AdminRequestError && err.status === 404;
        setMissing(notThere);
        setLoadError(!notThere);
      }
    })();
    return () => { current = false; };
  }, [id, attempt]);

  const retry = () => { setLoadError(false); setAttempt(n => n + 1); };

  const members = useMemo(() => {
    const list = [...(branch?.members ?? [])];
    list.sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));
    const q = filter.trim().toLowerCase();
    if (q === "") return list;
    return list.filter(m =>
      m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  }, [branch, filter]);

  // What to say about a member's standing in a listing, which is a summary rather
  // than the whole role set — the detail page has room for that.
  const standing = (roles: string[]): string | null => {
    if (roles.includes(ROLE_ADMIN) || roles.includes(ROLE_WSKO_ADMIN)) return translator.translate("Administratör för hela organisationen");
    if (branch?.federationId !== undefined && branch.federationId !== "" && roles.includes(federationAdmin(branch.federationId))) {
      return translator.translate("Förbundsadministratör");
    }
    if (roles.includes(branchAdmin(id))) return translator.translate("Grenadministratör");
    return null;
  };

  if (missing) {
    return (
      <div>
        <p className="text-body-secondary">{translator.translate("Den här grenen finns inte, eller så har du inte behörighet till den.")}</p>
        <Link to="/admin/organization">{translator.translate("Till organisationen")}</Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <p className="text-danger">{translator.translate("Kunde inte hämta medlemmarna.")}</p>
        <Button variant="outline-secondary" onClick={retry}>{translator.translate("Försök igen")}</Button>
      </div>
    );
  }

  if (branch === null) {
    return (
      <div className="d-flex align-items-center gap-2">
        <Spinner animation="border" size="sm" /> {translator.translate("Laddar…")}
      </div>
    );
  }

  return (
    <div>
      <h1 className="h4">{branch.name}</h1>
      <p className="text-secondary">
        {branch.members.length === 1
          ? translator.translate("1 medlem")
          : `${branch.members.length} ${translator.translate("medlemmar")}`}
      </p>

      {branch.members.length > 5 && (
        <Form.Control
          className="mb-3"
          style={{ maxWidth: "24rem" }}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder={translator.translate("Filtrera på namn eller e-post")}
        />
      )}

      {members.length === 0 ? (
        <p className="text-body-secondary">
          {branch.members.length === 0
            ? translator.translate("Grenen har inga medlemmar ännu.")
            : translator.translate("Ingen medlem matchar filtret.")}
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {members.map(member => (
            <Card key={member.id}>
              <Card.Body className="d-flex justify-content-between align-items-center flex-wrap gap-2 py-2">
                <div style={{ minWidth: 0 }}>
                  <Link to={`/admin/users/${encodeURIComponent(member.id)}`} className="fw-semibold">
                    {member.displayName || member.email}
                  </Link>
                  <div className="text-body-secondary small text-break">{member.email}</div>
                </div>
                {standing(member.roles) !== null && (
                  <span className="text-body-secondary small">{standing(member.roles)}</span>
                )}
              </Card.Body>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminBranchMembers;
