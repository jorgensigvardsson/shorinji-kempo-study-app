import { useContext, useEffect, useState, type FormEvent } from "react";
import { Button, Card, Form, Modal } from "react-bootstrap";
import { TranslatorContext } from "./i18n";
import { broadcastPush, type AudienceScope } from "./push";
import { getSyncManager } from "./sync/manager";
import type { AdminOrgBranch, AdminOrgFederation, AdminOrgTree } from "./sync/backend";
import { administeredBranches, administeredFederations, coversEverything } from "./roles";
import Loading from "./components/Loading";

// A federation's place in the audience: either the whole thing, or a specific
// subset of its branches narrowed to. Selecting any branch replaces the
// federation-scope entry with the selected branch-scope entries — narrowing
// is a positive choice of "just these", never "all but these".
interface FederationSelection {
    whole: boolean;
    branches: Set<string>;
}

// Admin-only action page: compose and send a push notification. Who may reach
// it is gated in routes.tsx by isAnyAdmin; what they may address here mirrors
// what AdminOrganization.tsx already opens on (coversEverything,
// administeredFederations, administeredBranches) — deciding what to *offer*
// only, since the server (PUSH-AUDIENCE-PLAN.md §4) decides what is allowed.
//
// administeredFederations/administeredBranches read the caller's *explicit*
// scoped roles, which is the wrong list for anybody who covers WSKO: a
// wsko_admin or admin typically holds no federation_admin:/branch_admin:
// roles at all, yet authz.Covers grants them every federation and branch —
// "all" is not the only thing they may narrow to. So for that caller the
// candidate lists are read from the tree instead (already scoped to
// everything for a caller who covers WSKO, per GET /auth/admin/org), and the
// role-derived lists are used only for everyone else.
const Broadcast = () => {
    const translator = useContext(TranslatorContext);
    const backendUser = getSyncManager().getBackendUserInfo();
    const roles = backendUser?.roles ?? [];
    const myBranchId = backendUser?.branchId ?? "";
    const atWSKO = coversEverything(roles);
    const ownFederations = administeredFederations(roles);
    const ownBranches = administeredBranches(roles);

    // A branch admin administering exactly one branch, and nothing else, has
    // no decision to make — the page states the destination as a fact rather
    // than offering a control with a single answer.
    const noPicker = !atWSKO && ownFederations.length === 0 && ownBranches.length === 1;

    const [tree, setTree] = useState<AdminOrgTree | null>(null);
    const [loadError, setLoadError] = useState(false);
    useEffect(() => {
        getSyncManager().adminOrgTree().then(setTree).catch(() => setLoadError(true));
    }, []);

    const federationsById = new Map<string, AdminOrgFederation>((tree?.federations ?? []).map(f => [f.id, f]));
    const branchesById = new Map<string, AdminOrgBranch>();
    for (const f of tree?.federations ?? []) for (const b of f.branches) branchesById.set(b.id, b);
    for (const b of tree?.wskoBranches ?? []) branchesById.set(b.id, b);

    // What the picker offers, as opposed to what decided noPicker/preselection
    // above: a WSKO-covering caller gets every federation and every
    // WSKO-attached branch in the tree, not just the ones matching roles they
    // may not hold at all.
    const federationCandidates = atWSKO ? [...federationsById.keys()] : ownFederations;
    const standaloneBranchCandidates = atWSKO
        ? (tree?.wskoBranches ?? []).map(b => b.id)
        : ownBranches.filter(id => !ownFederations.some(f => federationsById.get(f)?.branches.some(b => b.id === id)));

    const [selectedAll, setSelectedAll] = useState(false);
    const [fedSelections, setFedSelections] = useState<Record<string, FederationSelection>>({});
    const [branchSelections, setBranchSelections] = useState<Set<string>>(new Set());

    // An admin of exactly one federation, and nothing else, is preselected on
    // it — same reasoning as the no-picker case, just with an optional
    // narrowing left open rather than nothing left to decide at all.
    useEffect(() => {
        if (!atWSKO && ownFederations.length === 1 && ownBranches.length === 0) {
            setFedSelections({ [ownFederations[0]]: { whole: true, branches: new Set() } });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tree]);

    const toggleFederationWhole = (federationId: string, checked: boolean) => {
        setFedSelections(prev => ({ ...prev, [federationId]: { whole: checked, branches: new Set() } }));
    };
    const toggleFederationBranch = (federationId: string, branchId: string, checked: boolean) => {
        setFedSelections(prev => {
            const branches = new Set(prev[federationId]?.branches ?? []);
            if (checked) branches.add(branchId); else branches.delete(branchId);
            return { ...prev, [federationId]: { whole: false, branches } };
        });
    };
    const toggleBranch = (branchId: string, checked: boolean) => {
        setBranchSelections(prev => {
            const next = new Set(prev);
            if (checked) next.add(branchId); else next.delete(branchId);
            return next;
        });
    };

    const resolveAudience = (): AudienceScope[] => {
        if (noPicker) return [{ kind: "branch", id: ownBranches[0] }];
        if (selectedAll) return [{ kind: "wsko" }];
        const scopes: AudienceScope[] = [];
        for (const [federationId, sel] of Object.entries(fedSelections)) {
            if (sel.whole) scopes.push({ kind: "federation", id: federationId });
            else for (const branchId of sel.branches) scopes.push({ kind: "branch", id: branchId });
        }
        for (const branchId of branchSelections) scopes.push({ kind: "branch", id: branchId });
        return scopes;
    };

    const describeAudience = (scopes: AudienceScope[]): string => {
        if (scopes.some(s => s.kind === "wsko")) {
            return translator.translate("hela organisationen (WSKO)");
        }
        return scopes
            .map(s => {
                if (s.kind === "federation") {
                    const name = federationsById.get(s.id ?? "")?.name ?? s.id ?? "";
                    return translator.translate("alla klubbar i {0}", { params: [name] });
                }
                return branchesById.get(s.id ?? "")?.name ?? s.id ?? "";
            })
            .join(", ");
    };

    const audience = resolveAudience();
    const audienceEmpty = !noPicker && audience.length === 0;

    // Send without confirming only when the audience is exactly the sender's
    // own branch. Everything else — several branches, a federation, wsko, or
    // a single branch that isn't the sender's own — asks first, since a push
    // notification cannot be recalled (PUSH-AUDIENCE-PLAN.md §8.1). An empty
    // branchId is treated as "not my club": it costs one extra dialog in a
    // state that should not exist, and fails in the safe direction if it does.
    const needsConfirm = (scopes: AudienceScope[]): boolean =>
        !(scopes.length === 1 && scopes[0].kind === "branch" && myBranchId !== "" && scopes[0].id === myBranchId);

    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
    const [confirming, setConfirming] = useState(false);

    const doSend = async () => {
        setConfirming(false);
        setBusy(true);
        setStatus(null);
        try {
            const scopes = resolveAudience();
            const res = await broadcastPush({
                title: title.trim(),
                body: body.trim() || undefined,
                url: url.trim() || undefined,
                audience: scopes,
            });
            setStatus({
                ok: true,
                text: translator.translate("Notis skickad till {0} mottagare i {1}.",
                    { params: [String(res.sent), describeAudience(scopes)] }),
            });
            setTitle("");
            setBody("");
            setUrl("");
        } catch {
            setStatus({ ok: false, text: translator.translate("Det gick inte att skicka notisen. Försök igen.") });
        } finally {
            setBusy(false);
        }
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (!title.trim() || busy || audienceEmpty) return;
        if (needsConfirm(resolveAudience())) {
            setConfirming(true);
        } else {
            void doSend();
        }
    };

    if (loadError) {
        return <p className="text-danger">{translator.translate("Det gick inte att hämta organisationen. Försök igen senare.")}</p>;
    }
    if (tree === null) {
        return <Loading label={translator.translate("Hämtar mottagare…")} />;
    }

    return (
        <div>
            {noPicker ? (
                <p className="text-secondary">
                    {translator.translate("Notisen skickas till alla i {0} som har aktiverat notiser.",
                        { params: [branchesById.get(ownBranches[0])?.name ?? ownBranches[0]] })}
                </p>
            ) : (
                <Card className="mb-3" style={{ maxWidth: "32rem" }}>
                    <Card.Body>
                        <Card.Title className="h6">{translator.translate("Mottagare")}</Card.Title>
                        {atWSKO && (
                            <Form.Check
                                type="checkbox"
                                id="audience-all"
                                label={translator.translate("Alla i WSKO")}
                                checked={selectedAll}
                                onChange={e => setSelectedAll(e.target.checked)}
                            />
                        )}
                        {!selectedAll && federationCandidates.map(federationId => {
                            const federation = federationsById.get(federationId);
                            const sel = fedSelections[federationId] ?? { whole: false, branches: new Set<string>() };
                            return (
                                <div key={federationId} className="mb-2">
                                    <Form.Check
                                        type="checkbox"
                                        id={`audience-fed-${federationId}`}
                                        label={federation?.name ?? federationId}
                                        checked={sel.whole}
                                        onChange={e => toggleFederationWhole(federationId, e.target.checked)}
                                    />
                                    {federation && federation.branches.length > 0 && (
                                        <div className="ms-4">
                                            {federation.branches.map(branch => (
                                                <Form.Check
                                                    key={branch.id}
                                                    type="checkbox"
                                                    id={`audience-fed-${federationId}-branch-${branch.id}`}
                                                    label={branch.name}
                                                    checked={sel.branches.has(branch.id)}
                                                    onChange={e => toggleFederationBranch(federationId, branch.id, e.target.checked)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {!selectedAll && standaloneBranchCandidates
                            .map(branchId => (
                                <Form.Check
                                    key={branchId}
                                    type="checkbox"
                                    id={`audience-branch-${branchId}`}
                                    label={branchesById.get(branchId)?.name ?? branchId}
                                    checked={branchSelections.has(branchId)}
                                    onChange={e => toggleBranch(branchId, e.target.checked)}
                                />
                            ))}
                        {audienceEmpty && (
                            <p className="text-body-secondary small mt-2 mb-0">
                                {translator.translate("Välj minst en mottagare.")}
                            </p>
                        )}
                    </Card.Body>
                </Card>
            )}
            <Form as="form" onSubmit={submit} style={{ maxWidth: "32rem" }}>
                <Form.Group className="mb-3" controlId="broadcastTitle">
                    <Form.Label>{translator.translate("Rubrik")}</Form.Label>
                    <Form.Control value={title} onChange={e => { setTitle(e.target.value); setStatus(null); }} />
                </Form.Group>
                <Form.Group className="mb-3" controlId="broadcastBody">
                    <Form.Label>{translator.translate("Meddelande")}</Form.Label>
                    <Form.Control as="textarea" rows={3} value={body} onChange={e => setBody(e.target.value)} />
                </Form.Group>
                <Form.Group className="mb-3" controlId="broadcastUrl">
                    <Form.Label>{translator.translate("Länk (valfri)")}</Form.Label>
                    <Form.Control value={url} onChange={e => setUrl(e.target.value)} placeholder="/changelog" />
                </Form.Group>
                <Button type="submit" variant="primary" disabled={busy || !title.trim() || audienceEmpty}>
                    {busy ? translator.translate("Skickar…") : translator.translate("Skicka notis")}
                </Button>
            </Form>
            {status && (
                <p className={`mt-3 ${status.ok ? "text-success" : "text-danger"}`}>{status.text}</p>
            )}

            {/* A send cannot be recalled, so anything wider than the sender's own
                club is confirmed rather than sent on the way past. */}
            <Modal show={confirming} onHide={() => setConfirming(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title className="h5">{translator.translate("Bekräfta sändning")}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="mb-0">
                        {translator.translate("Det här meddelandet når {0}. Vill du skicka?", { params: [describeAudience(audience)] })}
                    </p>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="outline-secondary" onClick={() => setConfirming(false)}>
                        {translator.translate("Avbryt")}
                    </Button>
                    <Button variant="primary" onClick={() => { void doSend(); }}>
                        {translator.translate("Skicka notis")}
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default Broadcast;
