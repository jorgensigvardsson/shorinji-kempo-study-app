import { useContext, useEffect, useMemo, useState } from "react";
import { Button, Form, Spinner, Table } from "react-bootstrap";
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

            <div className="table-responsive">
                <Table hover className="align-middle">
                    <thead>
                        <tr>
                            <th>{translator.translate("Namn")}</th>
                            <th>{translator.translate("E-post")}</th>
                            <th>{translator.translate("Inloggningssätt")}</th>
                            <th>{translator.translate("Identiteter")}</th>
                            <th>{translator.translate("Administratör")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(u => {
                            const isSelf = u.email.toLowerCase() === currentEmail.toLowerCase();
                            const isAdmin = u.roles.includes("admin");
                            const editedName = nameEdits[u.id] ?? u.displayName;
                            return (
                                <tr key={u.id}>
                                    <td style={{ minWidth: "12rem" }}>
                                        {u.oidc ? (
                                            <span title={translator.translate("Namnet hanteras av inloggningsleverantören.")}>
                                                {u.displayName || <span className="text-body-secondary">—</span>}
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
                                    </td>
                                    <td><a href={`mailto:${u.email}`}>{u.email}</a></td>
                                    <td>{Object.keys(u.linkedIdentities).map(providerLabel).join(", ")}</td>
                                    <td className="small text-body-secondary">
                                        {Object.entries(u.linkedIdentities).map(([p, ident]) => (
                                            <div key={p}>{providerLabel(p)}: {ident.email || ident.sub}</div>
                                        ))}
                                    </td>
                                    <td>
                                        <Form.Check
                                            type="switch"
                                            checked={isAdmin}
                                            disabled={busyId === u.id || isSelf}
                                            title={isSelf ? translator.translate("Du kan inte ta bort din egen administratörsroll.") : undefined}
                                            onChange={e => { void toggleAdmin(u, e.target.checked); }}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-body-secondary">{translator.translate("Inga användare matchar filtret.")}</td>
                            </tr>
                        )}
                    </tbody>
                </Table>
            </div>
        </div>
    );
};

export default AdminUsers;
