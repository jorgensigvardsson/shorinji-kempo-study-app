import { useContext, useEffect, useMemo, useState } from "react";
import { Button, Card, Form, Spinner } from "react-bootstrap";
import { TranslatorContext } from "./i18n";
import { getSyncManager } from "./sync/manager";
import type { AdminUser } from "./sync/backend";

// Display names for the OIDC providers; "email" is translated inline.
const providerDisplayName: Record<string, string> = {
    google: "Google",
    microsoft: "Microsoft",
};

// Admin-only page: list every user, filter by name/email, edit the display name
// of non-OIDC users, and promote/demote admins. The route is only registered for
// admins (see routes.tsx) and the backend independently enforces the "admin" role.
const AdminUsers = () => {
    const translator = useContext(TranslatorContext);
    const currentEmail = getSyncManager().getBackendUserInfo()?.email ?? "";

    const [users, setUsers] = useState<AdminUser[] | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [filter, setFilter] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    // Pending display-name edits, keyed by user id.
    const [nameEdits, setNameEdits] = useState<Record<string, string>>({});
    // Per-row force-logout confirmation / transient result.
    const [confirmLogoutId, setConfirmLogoutId] = useState<string | null>(null);
    const [loggedOutId, setLoggedOutId] = useState<string | null>(null);

    const load = async () => {
        setLoadError(false);
        try {
            const list = await getSyncManager().adminListUsers();
            list.sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));
            setUsers(list);
        } catch {
            setLoadError(true);
        }
    };

    useEffect(() => { void load(); }, []);

    const filtered = useMemo(() => {
        const q = filter.trim().toLowerCase();
        if (!q || !users) return users ?? [];
        return users.filter(u =>
            u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }, [users, filter]);

    const providerLabel = (p: string) => p === "email" ? translator.translate("E-post") : (providerDisplayName[p] ?? p);

    const saveName = async (u: AdminUser) => {
        const next = (nameEdits[u.id] ?? u.displayName).trim();
        if (next === u.displayName) return;
        setBusyId(u.id);
        setError(null);
        try {
            await getSyncManager().adminUpdateDisplayName(u.id, next);
            setUsers(prev => prev?.map(x => x.id === u.id ? { ...x, displayName: next } : x) ?? prev);
            setNameEdits(prev => { const rest = { ...prev }; delete rest[u.id]; return rest; });
        } catch {
            setError(translator.translate("Kunde inte spara ändringen. Försök igen."));
        } finally {
            setBusyId(null);
        }
    };

    const toggleAdmin = async (u: AdminUser, admin: boolean) => {
        setBusyId(u.id);
        setError(null);
        try {
            await getSyncManager().adminSetAdmin(u.id, admin);
            const roles = admin
                ? Array.from(new Set([...u.roles, "admin"]))
                : u.roles.filter(r => r !== "admin");
            setUsers(prev => prev?.map(x => x.id === u.id ? { ...x, roles } : x) ?? prev);
        } catch (err) {
            if (err instanceof Error && err.message === "self-demotion") {
                setError(translator.translate("Du kan inte ta bort din egen administratörsroll."));
            } else {
                setError(translator.translate("Kunde inte spara ändringen. Försök igen."));
            }
        } finally {
            setBusyId(null);
        }
    };

    const forceLogout = async (u: AdminUser) => {
        setBusyId(u.id);
        setError(null);
        try {
            await getSyncManager().adminLogoutUser(u.id);
            setConfirmLogoutId(null);
            setLoggedOutId(u.id);
            setTimeout(() => setLoggedOutId(curr => (curr === u.id ? null : curr)), 3000);
        } catch {
            setError(translator.translate("Kunde inte logga ut användaren. Försök igen."));
        } finally {
            setBusyId(null);
        }
    };

    if (users === null && !loadError) {
        return <div className="d-flex align-items-center gap-2"><Spinner animation="border" size="sm" /> {translator.translate("Laddar…")}</div>;
    }

    if (loadError) {
        return (
            <div>
                <p className="text-danger">{translator.translate("Kunde inte hämta användarna. Försök igen.")}</p>
                <Button variant="outline-secondary" onClick={() => { void load(); }}>{translator.translate("Försök igen")}</Button>
            </div>
        );
    }

    return (
        <div>
            <p className="text-secondary">{translator.translate("Hantera användare som har registrerat sig.")}</p>

            <Form.Control
                className="mb-3"
                style={{ maxWidth: "24rem" }}
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder={translator.translate("Filtrera på namn eller e-post")}
            />

            {error && <p className="text-danger">{error}</p>}

            {filtered.length === 0 ? (
                <p className="text-body-secondary">{translator.translate("Inga användare matchar filtret.")}</p>
            ) : (
                <div
                    style={{
                        display: "grid",
                        // Cards fill the available width: as many ~22rem columns as fit,
                        // each stretching to share leftover space (auto-fit collapses
                        // empty tracks, so a lone card spans the full row). min(100%, …)
                        // avoids overflow on very narrow screens.
                        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))",
                        gap: "1rem",
                    }}
                >
                    {filtered.map(u => {
                        const isSelf = u.email.toLowerCase() === currentEmail.toLowerCase();
                        const isAdmin = u.roles.includes("admin");
                        const editedName = nameEdits[u.id] ?? u.displayName;
                        return (
                            <div key={u.id}>
                                <Card className="h-100">
                                    <Card.Body className="d-flex flex-column gap-2">
                                        {/* Name + admin toggle */}
                                        <div className="d-flex justify-content-between align-items-start gap-2">
                                            <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                                {u.oidc ? (
                                                    <span className="fw-semibold" title={translator.translate("Namnet hanteras av inloggningsleverantören.")}>
                                                        {u.displayName || <span className="text-body-secondary fw-normal">—</span>}
                                                    </span>
                                                ) : (
                                                    <div className="d-flex gap-2">
                                                        <Form.Control
                                                            size="sm"
                                                            value={editedName}
                                                            disabled={busyId === u.id}
                                                            onChange={e => setNameEdits(prev => ({ ...prev, [u.id]: e.target.value }))}
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="outline-primary"
                                                            disabled={busyId === u.id || editedName.trim() === u.displayName}
                                                            onClick={() => { void saveName(u); }}
                                                        >
                                                            {busyId === u.id ? translator.translate("Sparar…") : translator.translate("Spara")}
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                            <Form.Check
                                                type="switch"
                                                className="flex-shrink-0"
                                                label={translator.translate("Administratör")}
                                                checked={isAdmin}
                                                disabled={busyId === u.id || isSelf}
                                                title={isSelf ? translator.translate("Du kan inte ta bort din egen administratörsroll.") : undefined}
                                                onChange={e => { void toggleAdmin(u, e.target.checked); }}
                                            />
                                        </div>

                                        {/* Email */}
                                        <div className="text-break">
                                            <a href={`mailto:${u.email}`}>{u.email}</a>
                                        </div>

                                        {/* Login methods */}
                                        <div className="small">
                                            <span className="text-body-secondary">{translator.translate("Inloggningssätt")}: </span>
                                            {Object.keys(u.linkedIdentities).map(providerLabel).join(", ")}
                                        </div>

                                        {/* Identity details */}
                                        <div className="small text-body-secondary">
                                            {Object.entries(u.linkedIdentities).map(([p, ident]) => (
                                                <div key={p} className="text-break">{providerLabel(p)}: {ident.email || ident.sub}</div>
                                            ))}
                                        </div>

                                        {/* Sessions / force-logout, pinned to the bottom */}
                                        <div className="mt-auto pt-2">
                                            {loggedOutId === u.id ? (
                                                <span className="text-success small">{translator.translate("Utloggad")}</span>
                                            ) : confirmLogoutId === u.id ? (
                                                <div className="d-flex gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="danger"
                                                        disabled={busyId === u.id}
                                                        onClick={() => { void forceLogout(u); }}
                                                    >
                                                        {busyId === u.id ? translator.translate("Loggar ut…") : translator.translate("Bekräfta")}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline-secondary"
                                                        disabled={busyId === u.id}
                                                        onClick={() => setConfirmLogoutId(null)}
                                                    >
                                                        {translator.translate("Avbryt")}
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline-warning"
                                                    disabled={busyId !== null}
                                                    title={translator.translate("Loggar ut användaren på alla enheter. En pågående session kan vara aktiv i upp till en timme till.")}
                                                    onClick={() => setConfirmLogoutId(u.id)}
                                                >
                                                    {translator.translate("Logga ut")}
                                                </Button>
                                            )}
                                        </div>
                                    </Card.Body>
                                </Card>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default AdminUsers;
