import { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Form, Spinner } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import { TranslatorContext } from "./i18n";
import { getSyncManager } from "./sync/manager";
import { AdminRequestError, type AdminBranchMembers as Branch } from "./sync/backend";
import { ROLE_ADMIN, ROLE_WSKO_ADMIN, branchAdmin, federationAdmin } from "./roles";
import Loading from "./components/Loading";

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

  // Adding a member by hand: the form is closed until asked for, since most
  // visits to this page are to read the roll rather than to add to it.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // What to say after a successful add. It carries the name because the person
  // is now somewhere in a sorted list rather than at the end of it, and whether
  // the message reached them, which is the one part an admin may have to
  // finish by hand.
  const [added, setAdded] = useState<{ name: string; notified: boolean } | null>(null);

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

  const openAddForm = () => {
    setAdding(true);
    setNewName("");
    setNewEmail("");
    setAddError(null);
    setAdded(null);
  };

  const refusal = (err: unknown): string => {
    if (err instanceof AdminRequestError) {
      if (err.reason === "account_exists") return translator.translate("Den e-postadressen har redan ett konto.");
      if (err.reason === "invalid_email") return translator.translate("E-postadressen ser inte ut att vara giltig.");
      if (err.status === 403 || err.status === 404) return translator.translate("Du har inte behörighet att göra det.");
      // The one refusal that is not about what was typed: mail costs money, so
      // adding people is capped, and waiting a moment is the whole remedy.
      if (err.status === 429) return translator.translate("För många på kort tid. Vänta en stund och försök igen.");
    }
    return translator.translate("Medlemmen kunde inte läggas till. Försök igen.");
  };

  const addMember = () => {
    const name = newName.trim();
    const email = newEmail.trim();
    if (name === "" || email === "" || saving) return;
    setSaving(true);
    setAddError(null);
    void (async () => {
      try {
        const created = await getSyncManager().adminCreateUser(id, email, name, translator.currentLanguage);
        // Reloaded rather than patched in: the server decides the id and this
        // list is sorted, so a locally appended row would sit in the wrong place
        // until the next visit.
        setBranch(await getSyncManager().adminBranchMembers(id));
        setAdding(false);
        setAdded({ name: created.user.displayName, notified: created.notified });
      } catch (err) {
        setAddError(refusal(err));
      } finally {
        setSaving(false);
      }
    })();
  };

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
    if (roles.includes(ROLE_ADMIN) || roles.includes(ROLE_WSKO_ADMIN)) return translator.translate("Administratör för hela WSKO");
    if (branch?.federationId !== undefined && branch.federationId !== "" && roles.includes(federationAdmin(branch.federationId))) {
      return translator.translate("Förbundsadministratör");
    }
    if (roles.includes(branchAdmin(id))) return translator.translate("Klubbadministratör");
    return null;
  };

  if (missing) {
    return (
      <div>
        <p className="text-body-secondary">{translator.translate("Den här klubben finns inte, eller så har du inte behörighet till den.")}</p>
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
    return <Loading />;
  }

  return (
    <div>
      <h1 className="h4">{branch.name}</h1>
      {/* The count and the add button share a row, so the margin the count used
          to carry on its own moves out here — without it the button sits flush
          against the first member. */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <p className="text-secondary mb-0">
          {branch.members.length === 1
            ? translator.translate("1 medlem")
            : `${branch.members.length} ${translator.translate("medlemmar")}`}
        </p>
        {!adding && (
          <Button size="sm" variant="outline-primary" onClick={openAddForm}>
            {translator.translate("Lägg till medlem")}
          </Button>
        )}
      </div>

      {/* Somebody added this way never asked for an account, so the page says
          plainly that a message went out to tell them — and says so louder when
          it did not, since then only the admin can put it right. */}
      {added !== null && (
        <Alert variant={added.notified ? "success" : "warning"} className="mt-3" dismissible onClose={() => setAdded(null)}>
          {added.notified
            ? `${added.name} ${translator.translate("har lagts till och har fått ett mejl om kontot.")}`
            : `${added.name} ${translator.translate("har lagts till, men mejlet om kontot kunde inte skickas. Berätta gärna själv.")}`}
        </Alert>
      )}

      {adding && (
        <Card className="my-3">
          <Card.Body className="d-flex flex-column gap-2">
            <p className="text-body-secondary small mb-1">
              {translator.translate("Medlemmen får ett mejl om att kontot har skapats och loggar in med sin e-postadress — ingen registrering behövs.")}
            </p>
            {addError !== null && <p className="text-danger mb-1">{addError}</p>}
            <div className="d-flex gap-2 flex-wrap align-items-center">
              <Form.Control
                size="sm"
                autoFocus
                style={{ maxWidth: "16rem" }}
                value={newName}
                disabled={saving}
                placeholder={translator.translate("Namn")}
                aria-label={translator.translate("Namn")}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addMember(); }}
              />
              <Form.Control
                size="sm"
                type="email"
                style={{ maxWidth: "20rem" }}
                value={newEmail}
                disabled={saving}
                placeholder={translator.translate("E-post")}
                aria-label={translator.translate("E-post")}
                onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addMember(); }}
              />
              <Button size="sm" variant="primary"
                      disabled={saving || newName.trim() === "" || newEmail.trim() === ""}
                      onClick={addMember}>
                {saving ? <Spinner size="sm" /> : translator.translate("Lägg till")}
              </Button>
              <Button size="sm" variant="outline-secondary" disabled={saving} onClick={() => setAdding(false)}>
                {translator.translate("Avbryt")}
              </Button>
            </div>
          </Card.Body>
        </Card>
      )}

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
            ? translator.translate("Klubben har inga medlemmar ännu.")
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
