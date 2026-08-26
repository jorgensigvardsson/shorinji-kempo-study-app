import { useContext, useEffect, useState } from "react";
import { Button, Card, Form, Spinner } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import { TranslatorContext } from "./i18n";
import { getSyncManager } from "./sync/manager";
import { AdminRequestError, type AdminOrgTree, type AdminUser as User } from "./sync/backend";
import { ROLE_ADMIN, ROLE_WSKO_ADMIN, administeredBranches, administeredFederations, branchAdmin, coversEverything, federationAdmin } from "./roles";

// Display names for the OIDC providers; "email" is translated inline.
const providerDisplayName: Record<string, string> = {
  google: "Google",
  microsoft: "Microsoft",
};

// A role this page can offer, with the reason it is or is not on the table.
interface Grant {
  role: string;
  label: string;
  offered: boolean;
}

// One member, and everything an admin may do to their standing. Which of those
// controls appears depends on what the caller's roles cover — and every one of
// them is checked again by the server against what they actually cover.
const AdminUser = () => {
  const translator = useContext(TranslatorContext);
  const { id = "" } = useParams<{ id: string }>();
  const callerRoles = getSyncManager().getBackendUserInfo()?.roles ?? [];
  const callerEmail = getSyncManager().getBackendUserInfo()?.email ?? "";

  const [user, setUser] = useState<User | null>(null);
  // The organization is fetched alongside the user because a branch id is not
  // something to show anybody: the tree turns it into the name of a club and the
  // federation above it.
  const [tree, setTree] = useState<AdminOrgTree | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editedName, setEditedName] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);

  // Bumped to ask again, so a retry re-runs the effect rather than firing a
  // second request beside it.
  const [attempt, setAttempt] = useState(0);

  // Both requests go out together and the effect can abandon their answers, so
  // walking from one member to the next cannot leave the slower reply on top of
  // the newer one.
  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const [fetchedUser, fetchedTree] = await Promise.all([
          getSyncManager().adminGetUser(id),
          getSyncManager().adminOrgTree(),
        ]);
        if (!current) return;
        setUser(fetchedUser);
        setTree(fetchedTree);
        setEditedName(null);
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

  const refusal = (err: unknown): string => {
    if (err instanceof AdminRequestError) {
      if (err.status === 409) return translator.translate("Du kan inte ta bort din egen administratörsroll.");
      if (err.status === 403) return translator.translate("Du har inte behörighet att göra det.");
    }
    return translator.translate("Ändringen kunde inte sparas. Försök igen.");
  };

  const act = async (run: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await run();
      after?.();
    } catch (err) {
      setError(refusal(err));
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <div>
        <p className="text-body-secondary">{translator.translate("Den här användaren finns inte, eller så har du inte behörighet till den.")}</p>
        <Link to="/admin/organization">{translator.translate("Till organisationen")}</Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <p className="text-danger">{translator.translate("Kunde inte hämta användaren.")}</p>
        <Button variant="outline-secondary" onClick={retry}>{translator.translate("Försök igen")}</Button>
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="d-flex align-items-center gap-2">
        <Spinner animation="border" size="sm" /> {translator.translate("Laddar…")}
      </div>
    );
  }

  // Where this member sits, resolved through the tree the caller was served — so
  // a branch they cannot see is one they cannot name either.
  const federation = tree?.federations.find(f => f.branches.some(b => b.id === user.branchId));
  const branch = federation?.branches.find(b => b.id === user.branchId)
    ?? tree?.wskoBranches.find(b => b.id === user.branchId);

  const atWSKO = coversEverything(callerRoles);
  const coversFederation = (fid: string) => atWSKO || administeredFederations(callerRoles).includes(fid);
  const coversBranch = (bid: string) =>
    atWSKO
    || administeredBranches(callerRoles).includes(bid)
    || (federation !== undefined && coversFederation(federation.id));

  const isSelf = user.email.toLowerCase() === callerEmail.toLowerCase();

  // The roles on offer, narrowest first. Each is grantable exactly where the
  // server says it is — authority over the scope the role confers — with one
  // rule that does not follow from scope: the technical superuser is handed out
  // by admins alone, or a WSKO admin could grant themselves the one power their
  // own role withholds.
  const grants: Grant[] = [
    ...(user.branchId !== undefined && user.branchId !== "" && branch !== undefined ? [{
      role: branchAdmin(user.branchId),
      label: `${translator.translate("Administratör för")} ${branch.name}`,
      offered: coversBranch(user.branchId),
    }] : []),
    ...(federation !== undefined ? [{
      role: federationAdmin(federation.id),
      label: `${translator.translate("Administratör för")} ${federation.name}`,
      offered: coversFederation(federation.id),
    }] : []),
    { role: ROLE_WSKO_ADMIN, label: translator.translate("Administratör för hela organisationen"), offered: atWSKO },
    { role: ROLE_ADMIN, label: translator.translate("Teknisk administratör"), offered: callerRoles.includes(ROLE_ADMIN) },
  ];

  const setRole = (role: string, held: boolean) => {
    // The whole set goes over, not a flag, so a role this page never showed —
    // authority over some other branch — is carried through rather than dropped.
    const next = held
      ? Array.from(new Set([...user.roles, role]))
      : user.roles.filter(r => r !== role);
    void act(
      () => getSyncManager().adminSetRoles(user.id, next),
      () => setUser({ ...user, roles: next }));
  };

  const saveName = () => {
    const name = (editedName ?? user.displayName).trim();
    if (name === user.displayName) return;
    void act(
      () => getSyncManager().adminUpdateDisplayName(user.id, name),
      () => { setUser({ ...user, displayName: name }); setEditedName(null); });
  };

  const forceLogout = () => {
    void act(
      () => getSyncManager().adminLogoutUser(user.id),
      () => { setConfirmLogout(false); setLoggedOut(true); });
  };

  const providerLabel = (p: string) => p === "email" ? translator.translate("E-post") : (providerDisplayName[p] ?? p);
  const nameValue = editedName ?? user.displayName;

  return (
    <div>
      <h1 className="h4">{user.displayName || user.email}</h1>
      <p className="text-secondary">
        {branch !== undefined
          ? <Link to={`/admin/branches/${encodeURIComponent(branch.id)}/members`}>{branch.name}</Link>
          : translator.translate("Ingen klubb")}
        {federation !== undefined && <> · {federation.name}</>}
      </p>

      {error !== null && <p className="text-danger">{error}</p>}

      <Card className="mb-3">
        <Card.Body className="d-flex flex-column gap-3">
          <div>
            <Form.Label className="small text-body-secondary mb-1">{translator.translate("Namn")}</Form.Label>
            {user.oidc ? (
              <div title={translator.translate("Namnet hanteras av inloggningsleverantören.")}>
                {user.displayName || "—"}
              </div>
            ) : (
              <div className="d-flex gap-2" style={{ maxWidth: "28rem" }}>
                <Form.Control
                  size="sm"
                  value={nameValue}
                  disabled={busy}
                  aria-label={translator.translate("Namn")}
                  onChange={e => setEditedName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveName(); }}
                />
                <Button size="sm" variant="outline-primary"
                        disabled={busy || nameValue.trim() === user.displayName}
                        onClick={saveName}>
                  {translator.translate("Spara")}
                </Button>
              </div>
            )}
          </div>

          <div>
            <div className="small text-body-secondary">{translator.translate("E-post")}</div>
            <a href={`mailto:${user.email}`} className="text-break">{user.email}</a>
          </div>

          <div>
            <div className="small text-body-secondary">{translator.translate("Inloggningssätt")}</div>
            {Object.entries(user.linkedIdentities).map(([provider, identity]) => (
              <div key={provider} className="text-break small">
                {providerLabel(provider)}: {identity.email || identity.sub}
              </div>
            ))}
          </div>
        </Card.Body>
      </Card>

      <Card className="mb-3">
        <Card.Header>{translator.translate("Behörigheter")}</Card.Header>
        <Card.Body className="d-flex flex-column gap-2">
          {grants.filter(g => g.offered || user.roles.includes(g.role)).map(grant => {
            const held = user.roles.includes(grant.role);
            // Somebody can hold a role this caller cannot grant — appointed from
            // further up. It is shown, so the page tells the truth about their
            // standing, but not as something to switch off.
            const locked = !grant.offered
              || (isSelf && held && (grant.role === ROLE_ADMIN || grant.role === ROLE_WSKO_ADMIN));
            return (
              <Form.Check
                key={grant.role}
                type="switch"
                id={`grant-${grant.role}`}
                label={grant.label}
                checked={held}
                disabled={busy || locked}
                title={isSelf && held ? translator.translate("Du kan inte ta bort din egen administratörsroll.") : undefined}
                onChange={e => setRole(grant.role, e.target.checked)}
              />
            );
          })}
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>{translator.translate("Sessioner")}</Card.Header>
        <Card.Body>
          {loggedOut ? (
            <span className="text-success">{translator.translate("Utloggad")}</span>
          ) : confirmLogout ? (
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <span>{translator.translate("Logga ut användaren på alla enheter?")}</span>
              <Button size="sm" variant="danger" disabled={busy} onClick={forceLogout}>
                {busy ? <Spinner size="sm" /> : translator.translate("Ja, logga ut")}
              </Button>
              <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => setConfirmLogout(false)}>
                {translator.translate("Avbryt")}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline-warning" disabled={busy}
                    title={translator.translate("Loggar ut användaren på alla enheter. En pågående session kan vara aktiv i upp till en timme till.")}
                    onClick={() => setConfirmLogout(true)}>
              {translator.translate("Logga ut")}
            </Button>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default AdminUser;
