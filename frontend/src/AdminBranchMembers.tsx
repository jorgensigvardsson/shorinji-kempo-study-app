import { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Form, Modal, Spinner } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import { TranslatorContext } from "./i18n";
import { getSyncManager } from "./sync/manager";
import { AdminRequestError, type AdminBranchMembers as Branch } from "./sync/backend";
import { ROLE_ADMIN, ROLE_WSKO_ADMIN, branchAdmin, federationAdmin } from "./roles";
import { orgAuthority } from "./organization";
import { memberNameRefusal, orgWriteRefusal } from "./adminOrgRefusal";
import Loading from "./components/Loading";
import RenamePencil from "./components/RenamePencil";
import InlineNameEditor from "./components/InlineNameEditor";

// WSKO is the root rather than a record with a name, so on the wire a branch
// attached to it carries no federation; "" is that place, the same as in
// AdminOrganization.tsx.
const WSKO = "";

// One branch's members. This is what replaced the flat roll of everybody: a club
// of a hundred is a page you can read, and the branch next door is not on it.
//
// It is also where the branch itself is changed — renamed, or moved to another
// federation — since this is the page about that branch, and the organization
// overview stays a picture of the whole rather than a row of buttons per club.
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

  // Renaming the branch: the heading turns into a field while it is open.
  const [renaming, setRenaming] = useState(false);
  // Which member's name is being edited, one at a time, and how it went.
  const [renamingMember, setRenamingMember] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  // Moving the branch to another federation. Rare, and it changes who may see
  // its members — so it is asked for in a dialog and confirmed, rather than
  // being a dropdown that acts on the way past. The destinations are the
  // organization's federations, fetched only when the dialog is opened: most
  // visits to this page never need them.
  const [moving, setMoving] = useState(false);
  const [destinations, setDestinations] = useState<{ id: string; label: string }[] | null>(null);
  const [moveTo, setMoveTo] = useState(WSKO);
  const [orgBusy, setOrgBusy] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

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

  // Every change to the branch is followed by a reload rather than a local
  // patch, as on the organization page: the server is what decides.
  const writeBranch = async (changes: { name?: string; federationId?: string }) => {
    setOrgBusy(true);
    setOrgError(null);
    try {
      await getSyncManager().adminUpdateBranch(id, changes);
      setBranch(await getSyncManager().adminBranchMembers(id));
      return true;
    } catch (err) {
      setOrgError(orgWriteRefusal(err, translator));
      return false;
    } finally {
      setOrgBusy(false);
    }
  };

  const startRename = () => {
    setRenaming(true);
    setOrgError(null);
  };

  const saveRename = (name: string) => {
    void (async () => {
      if (await writeBranch({ name })) setRenaming(false);
    })();
  };

  // Renaming a member — for the account registered as "xXShadowKenXx" whose
  // club knows them as Anna. Reloaded afterwards like everything else here: the
  // list is sorted by name, and the renamed member may now sit elsewhere in it.
  // Offered to whoever covers the branch, which is also what the server asks.
  const saveMemberName = (memberId: string, name: string) => {
    setMemberBusy(true);
    setMemberError(null);
    void (async () => {
      try {
        await getSyncManager().adminUpdateDisplayName(memberId, name);
        setBranch(await getSyncManager().adminBranchMembers(id));
        setRenamingMember(null);
      } catch (err) {
        setMemberError(memberNameRefusal(err, translator));
      } finally {
        setMemberBusy(false);
      }
    })();
  };

  const startMove = () => {
    // Opening on where it already is means the confirm button starts disabled:
    // the dialog asks a question rather than proposing an answer.
    setMoveTo(branch?.federationId ?? WSKO);
    setMoving(true);
    setOrgError(null);
    if (destinations !== null) return;
    void (async () => {
      try {
        const tree = await getSyncManager().adminOrgTree();
        setDestinations([
          ...tree.federations.map(f => ({ id: f.id, label: f.name })),
          { id: WSKO, label: "WSKO" },
        ]);
      } catch {
        setOrgError(translator.translate("Kunde inte hämta organisationen."));
      }
    })();
  };

  const confirmMove = () => {
    if (moveTo === (branch?.federationId ?? WSKO) || orgBusy) return;
    // "" is a real destination here, not a missing one: it moves the branch out
    // of its federation and up to WSKO.
    void (async () => {
      if (await writeBranch({ federationId: moveTo })) setMoving(false);
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

  // What to offer, decided the way the organization page decides it and refused
  // again by the server on what the caller actually covers. A branch is covered
  // through its federation as well as directly. A move is a departure and an
  // arrival, and the server wants authority over both — which nobody short of
  // WSKO has for every destination, so it is a WSKO-only offer.
  const federationId = branch.federationId ?? WSKO;
  const authority = orgAuthority();
  const canRename = authority.coversBranch(id, federationId);
  const canMove = authority.atWSKO;

  return (
    <div>
      {renaming ? (
        <div className="mb-2">
          <InlineNameEditor translator={translator} initial={branch.name} busy={orgBusy}
                            onSave={saveRename} onCancel={() => setRenaming(false)} />
        </div>
      ) : (
        <div className="d-flex align-items-center gap-1 mb-2">
          <h1 className="h4 mb-0">{branch.name}</h1>
          {canRename && <RenamePencil translator={translator} disabled={orgBusy} onClick={startRename} />}
        </div>
      )}
      {orgError !== null && !moving && <p className="text-danger">{orgError}</p>}
      <p className="text-secondary mb-3">
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
            ? translator.translate("Klubben har inga medlemmar ännu.")
            : translator.translate("Ingen medlem matchar filtret.")}
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {members.map(member => (
            <Card key={member.id}>
              <Card.Body className="d-flex justify-content-between align-items-center flex-wrap gap-2 py-2">
                {renamingMember === member.id ? (
                  <div className="flex-grow-1">
                    <InlineNameEditor translator={translator} initial={member.displayName} busy={memberBusy}
                                      onSave={name => saveMemberName(member.id, name)}
                                      onCancel={() => { setRenamingMember(null); setMemberError(null); }} />
                    {memberError !== null && <p className="text-danger small mb-0 mt-1">{memberError}</p>}
                    <div className="text-body-secondary small text-break mt-1">{member.email}</div>
                  </div>
                ) : (
                  <div style={{ minWidth: 0 }}>
                    <div className="d-flex align-items-center">
                      <Link to={`/admin/users/${encodeURIComponent(member.id)}`} className="fw-semibold">
                        {member.displayName || member.email}
                      </Link>
                      {/* No pencil where the name comes from Google or Microsoft:
                          the provider would put its own back at the next sign-in,
                          and the server refuses the change for that reason. */}
                      {canRename && !member.oidc && (
                        <RenamePencil translator={translator} disabled={memberBusy}
                                      onClick={() => { setRenamingMember(member.id); setMemberError(null); }} />
                      )}
                    </div>
                    <div className="text-body-secondary small text-break">{member.email}</div>
                  </div>
                )}
                {standing(member.roles) !== null && (
                  <span className="text-body-secondary small">{standing(member.roles)}</span>
                )}
              </Card.Body>
            </Card>
          ))}
        </div>
      )}

      {/* Everything below the list acts on the branch: the roll is what the page
          is for, and what to do with it comes after reading it. Adding a member
          opens its form here too, next to the button that asked for it, and the
          word on how it went lands in the same place. */}

      {/* Somebody added this way never asked for an account, so the page says
          plainly that a message went out to tell them — and says so louder when
          it did not, since then only the admin can put it right. */}
      {added !== null && (
        <Alert variant={added.notified ? "success" : "warning"} className="mt-3 mb-0" dismissible onClose={() => setAdded(null)}>
          {added.notified
            ? `${added.name} ${translator.translate("har lagts till och har fått ett mejl om kontot.")}`
            : `${added.name} ${translator.translate("har lagts till, men mejlet om kontot kunde inte skickas. Berätta gärna själv.")}`}
        </Alert>
      )}

      {adding && (
        <Card className="mt-3">
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

      {/* Right-aligned under the list, flush with its right edge. While the add
          form is open its own button is gone — the form is the answer to it. */}
      {(canMove || !adding) && (
        <div className="d-flex justify-content-end flex-wrap gap-2 mt-3">
          {canMove && (
            <Button size="sm" variant="outline-danger" disabled={orgBusy} onClick={startMove}>
              {translator.translate("Byt förbund")}
            </Button>
          )}
          {!adding && (
            <Button size="sm" variant="outline-primary" onClick={openAddForm}>
              {translator.translate("Lägg till medlem")}
            </Button>
          )}
        </div>
      )}

      {/* A branch's federation decides who administers its members, so changing
          it hands those members to a different set of people. That is worth a
          deliberate act rather than a stray click. */}
      <Modal show={moving} onHide={() => setMoving(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="h5">{translator.translate("Byt förbund")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* The club's own name, never translated — like every organization name. */}
          <p className="fw-semibold mb-1">{branch.name}</p>
          <p className="text-body-secondary">
            {translator.translate("Att flytta en klubb till ett annat förbund ändrar vilka administratörer som kan se dess medlemmar.")}
          </p>
          {orgError !== null && <p className="text-danger">{orgError}</p>}
          {destinations === null
            ? orgError === null && <Spinner size="sm" />
            : (
              <Form.Group controlId="moveBranchDestination">
                <Form.Label>{translator.translate("Flytta till")}</Form.Label>
                <Form.Select value={moveTo} disabled={orgBusy} onChange={e => setMoveTo(e.target.value)}>
                  {destinations.map(d => (
                    <option key={d.id === WSKO ? "wsko" : d.id} value={d.id}>{d.label}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={orgBusy} onClick={() => setMoving(false)}>
            {translator.translate("Avbryt")}
          </Button>
          {/* Disabled until the destination actually differs: confirming a move
              to where the branch already is would be a write that reads as one. */}
          <Button variant="danger" disabled={orgBusy || destinations === null || moveTo === federationId}
                  onClick={confirmMove}>
            {orgBusy ? <Spinner size="sm" /> : translator.translate("Flytta klubben")}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default AdminBranchMembers;
