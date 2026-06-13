import { useEffect, useMemo, useState } from "react";
import { Button, Dropdown, Form } from "react-bootstrap";
import { useSyncProvider, useSyncState, useTheme } from "./hooks";
import { getAppDataStore } from "./persistence/store";
import type { CurrentWeekAnchor, SyncProvider } from "./persistence/schema";
import type { Language, Translator } from "./i18n";
import { humanGradeName, type GradePlan, type GradeName } from "./data";
import { DefaultTextSize } from "./persistence/text-size";
import { getSyncManager } from "./sync/manager";
import { toLocalDateKey } from "./utilities/current-week";
import { getCurrentSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from "./push";
import { DeviceHdd, Download, ExclamationTriangleFill, PersonCircle, Upload } from "react-bootstrap-icons";

const BACKEND_ENABLED = import.meta.env.VITE_BACKEND_ENABLED === "true";
const DEBUG = import.meta.env.VITE_DEBUG === "true";
import "./Settings.css";

interface Props {
    translator: Translator;
    nextGrade: GradePlan;
    allGradePlans: GradePlan[];
    textSize: number;
    onSetLanguage: (lang: Language) => void;
    onSetGrade: (grade: GradePlan) => void;
    onSetTextSize: (textSize: number) => void;
    onShowLogin: () => void;
}

const Settings = (props: Props) => {
    const { translator, nextGrade, allGradePlans, textSize, onSetLanguage, onSetGrade, onSetTextSize, onShowLogin } = props;
    const store = getAppDataStore();
    const { theme, setTheme } = useTheme();
    const { syncProvider, setSyncProvider } = useSyncProvider();
    const syncState = useSyncState();
    const [currentWeekAnchor, setCurrentWeekAnchor] = useState<CurrentWeekAnchor | null>(() => store.get("currentWeekAnchor"));
    const [kenshiNumber, setKenshiNumber] = useState(() => store.get("kenshiNumber"));
    const [showKanjiOnHokeiCards, setShowKanjiOnHokeiCards] = useState(() => store.get("showKanjiOnHokeiCards"));
    const availableWeeks = useMemo(
        () => [...new Set(nextGrade.weeks.map(week => week.week))].sort((a, b) => a - b),
        [nextGrade]
    );
    const selectedWeek = availableWeeks.includes(currentWeekAnchor?.week ?? -1)
        ? currentWeekAnchor!.week
        : (availableWeeks[0] ?? 1);
    const languages: { code: Language; key: string }[] = [
        { code: "sv", key: "Svenska" },
        { code: "en", key: "Engelska" },
        { code: "tr", key: "Turkiska" },
        { code: "ja", key: "Japanska" },
    ];

    const gradeLabel = (name: GradeName) => {
        const humanName = humanGradeName(name);

        if (!translator.isJapanese)
            return `${translator.translate(humanName, { capitalize: true })} (${translator.japanese(humanName)})`;

        return translator.japanese(humanName);
    }

    const isConnected = syncState.status === "connected" || syncState.status === "syncing" || syncState.status === "connecting";
    const providerLabel = syncProvider === "onedrive"
        ? "OneDrive"
        : syncProvider === "google-drive"
            ? "Google Drive"
            : syncProvider === "dropbox"
                ? "Dropbox"
                : translator.translate("Ingen");
    const lastSyncedLabel = syncState.lastSyncedAt
        ? new Date(syncState.lastSyncedAt).toLocaleString()
        : translator.translate("Aldrig");
    const syncStateLabel = syncState.message ? `, ${translator.translate(syncState.message)}` : null;
    const syncProviderOptions: { value: SyncProvider; label: string; logo?: string }[] = [
        { value: "local", label: translator.translate("Ingen") },
        { value: "onedrive", label: "OneDrive", logo: "/onedrive-logo.svg" },
        { value: "google-drive", label: "Google Drive", logo: "/google-drive-logo.svg" },
    ];
    const selectedSyncProvider = syncProviderOptions.find(option => option.value === syncProvider) ?? syncProviderOptions[0];

    useEffect(() => store.subscribe("currentWeekAnchor", setCurrentWeekAnchor), [store]);
    useEffect(() => store.subscribe("kenshiNumber", setKenshiNumber), [store]);
    useEffect(() => store.subscribe("showKanjiOnHokeiCards", setShowKanjiOnHokeiCards), [store]);

    const exportData = () => {
        const { version, data } = store.getDocument();
        const json = JSON.stringify({ version, data }, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `shorinji-kempo-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const importData = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const parsed = JSON.parse(reader.result as string) as Record<string, unknown>;
                    const current = store.getDocument();
                    store.setDocument({
                        ...current,
                        updatedAt: new Date().toISOString(),
                        version: typeof parsed.version === "number" ? parsed.version : current.version,
                        // sanitizeDocument in the store validates and defaults all fields
                        data: (parsed.data ?? current.data) as typeof current.data,
                    });
                } catch {
                    // malformed file — ignore silently
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const setAnchoredWeek = (week: number) => {
        store.set("currentWeekAnchor", {
            week,
            anchorDate: toLocalDateKey()
        });
    };
    
    return (
        <div>
            <Form.Group className="mb-3" controlId="settingsTheme">
                <Form.Label>{translator.translate("Tema")}</Form.Label>
                <Form.Select value={theme} onChange={e => setTheme(e.target.value as "light" | "dark" | "system")}>
                    <option value={"light"}>{translator.translate("Ljust")}</option>
                    <option value={"dark"}>{translator.translate("Mörkt")}</option>
                    <option value={"system"}>{translator.translate("System")}</option>
                </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3" controlId="settingsTheme">
                <Form.Label>{translator.translate("Språk")}</Form.Label>
                <Form.Select onChange={e => onSetLanguage(e.target.value as Language)} value={translator.currentLanguage}>
                    {languages.map(language => (
                        <option value={language.code} key={language.code}>
                            {translator.explicitTranslate(language.code, language.key)} ({translator.translate(language.key)})
                        </option>
                    ))}
                </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3" controlId="textSize">
                <Form.Label>{translator.translate("Textstorlek")}</Form.Label>
                <Form.Select onChange={e => onSetTextSize(parseFloat(e.target.value))} value={textSize}>
                    <option value="1.0">{translator.translate("Liten")}</option>
                    <option value={DefaultTextSize}>{translator.translate("Mindre")}</option>
                    <option value="1.2">{translator.translate("Medium")}</option>
                    <option value="1.3">{translator.translate("Större")}</option>
                    <option value="1.4">{translator.translate("Störst")}</option>
                </Form.Select>
            </Form.Group>

            {!translator.isJapanese && (
                <Form.Group className="mb-3" controlId="settingsShowKanjiOnHokeiCards">
                    <Form.Check
                        type="switch"
                        label={translator.translate("Visa kanji")}
                        checked={showKanjiOnHokeiCards}
                        onChange={e => {
                            store.set("showKanjiOnHokeiCards", e.target.checked);
                        }}
                    />
                </Form.Group>
            )}

            <Form.Group className="mb-3" controlId="settingsKenshiNumber">
                <Form.Label>{translator.translate("Kenshinummer")}</Form.Label>
                <Form.Control
                    type="text"
                    value={kenshiNumber ?? ""}
                    onChange={e => {
                        const value = e.target.value ?? "";
                        const stored = value.length > 0 ? value : undefined;
                        setKenshiNumber(stored);
                        store.set("kenshiNumber", stored);
                    }}
                />
            </Form.Group>

            <Form.Group className="mb-3" controlId="settingsLevel">
                <Form.Label>{translator.translate("Min nästa grad")}</Form.Label>
                <Form.Select onChange={e => onSetGrade(allGradePlans.find(x => x.grade === e.target.value)!)} value={nextGrade.grade}>
                    {
                        allGradePlans.map(
                            (l, i) => <option value={l.grade} key={i}>{gradeLabel(l.grade)}</option>
                        )
                    }
                </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
                <Form.Label>{translator.translate("Uppdateringsnotiser")}</Form.Label>
                <NotificationPermissionControl translator={translator} />
            </Form.Group>

            <Form.Group className="mb-3" controlId="settingsCurrentWeek">
                <Form.Label>{translator.translate("Aktuell vecka")}</Form.Label>
                <Form.Select value={selectedWeek} onChange={e => setAnchoredWeek(parseInt(e.target.value, 10))}>
                    {availableWeeks.map(week => (
                        <option key={week} value={week}>{translator.translate("Vecka")} {week}</option>
                    ))}
                </Form.Select>
                <Form.Text className="d-block mt-2">
                    {translator.translate("Välj vilken träningsvecka som ska visas på Kamoku-sidan. Appen kommer ihåg när du gjorde valet och räknar automatiskt upp veckan allt eftersom tiden går.")}
                    {currentWeekAnchor && <> {translator.translate("Inställningen gjordes den {0}.", { params: [currentWeekAnchor.anchorDate] })}</>}
                </Form.Text>
            </Form.Group>

            {syncProvider !== "backend" && (
                <Form.Group className="mb-3" controlId="settingsSyncProvider">
                    <Form.Label>{translator.translate("Synk")}</Form.Label>
                    {!isConnected && (
                        <>
                            <Dropdown onSelect={eventKey => eventKey && setSyncProvider(eventKey as SyncProvider)}>
                                <Dropdown.Toggle as="button" type="button" className="form-select settings-provider-select-toggle">
                                    <ProviderLogo logo={selectedSyncProvider.logo} />
                                    <span>{selectedSyncProvider.label}</span>
                                </Dropdown.Toggle>
                                <Dropdown.Menu className="w-100 settings-provider-menu">
                                    {syncProviderOptions.map(option => (
                                        <Dropdown.Item
                                            key={option.value}
                                            eventKey={option.value}
                                            active={option.value === syncProvider}
                                            className="settings-provider-option"
                                        >
                                            <ProviderLogo logo={option.logo} />
                                            <span>{option.label}</span>
                                        </Dropdown.Item>
                                    ))}
                                </Dropdown.Menu>
                            </Dropdown>
                            {syncProvider !== "local" && (
                                <>
                                    {syncState.status === "auth_expired" && (
                                        <Form.Text className="d-block mt-2 text-warning">
                                            {translator.translate("Anslutningen till {0} har gått ut.", { params: [providerLabel] })}
                                        </Form.Text>
                                    )}
                                    <div className="mt-2 d-flex gap-2">
                                        <Button
                                            variant="outline-primary"
                                            size="sm"
                                            onClick={() => getSyncManager().connect()}
                                            disabled={syncState.status === "connecting" || syncState.status === "syncing"}
                                        >
                                            {translator.translate("Anslut")}
                                        </Button>
                                    </div>
                                    {syncProvider === "onedrive" && (
                                        <Form.Text className="d-block mt-2">
                                            {translator.translate("OneDrive-anslutningar behöver förnyas var 24:e timme.")}
                                        </Form.Text>
                                    )}
                                </>
                            )}
                        </>
                    )}
                    {isConnected && (
                        <>
                            <Form.Text className="d-block mt-2">
                                {translator.translate("Ansluten till")} {providerLabel}, {translator.translate("senast synkad")} {lastSyncedLabel}{syncStateLabel}
                            </Form.Text>
                            <div className="mt-2 d-flex gap-2">
                                <Button
                                    variant="outline-secondary"
                                    size="sm"
                                    onClick={() => getSyncManager().disconnect()}
                                >
                                    {translator.translate("Koppla från")}
                                </Button>
                                <Button
                                    variant="outline-success"
                                    size="sm"
                                    onClick={() => { void getSyncManager().syncNow(); }}
                                    disabled={syncState.status === "connecting" || syncState.status === "syncing"}
                                >
                                    {translator.translate("Synka nu")}
                                </Button>
                            </div>
                        </>
                    )}
                    {syncProvider === "google-drive" && (
                        <Form.Text className="d-block mt-2 text-warning">
                            <ExclamationTriangleFill className="me-1" />
                            {translator.translate("Support för Google Drive är fortfarande beta")}
                        </Form.Text>
                    )}
                </Form.Group>
            )}

            {syncProvider === "backend" && (
                <Form.Group className="mb-3" controlId="settingsAccount">
                    <Form.Label>{translator.translate("Konto")}</Form.Label>
                    <AccountStatus translator={translator} onShowLogin={onShowLogin} />
                </Form.Group>
            )}

            {BACKEND_ENABLED && syncProvider !== "backend" && (
                <Form.Group className="mb-3" controlId="settingsAccount">
                    <Form.Label>{translator.translate("Konto")}</Form.Label>
                    <Form.Text className="d-block mt-1 mb-2">
                        {translator.translate("Spara dina framsteg på alla enheter genom att logga in.")}
                    </Form.Text>
                    <Button variant="outline-primary" size="sm" onClick={onShowLogin}>
                        <PersonCircle className="me-2" />
                        {translator.translate("Logga in")}
                    </Button>
                </Form.Group>
            )}
            {syncProvider !== "backend" && (
                <Form.Group className="mb-3">
                    <Form.Label>{translator.translate("Exportera/importera data")}</Form.Label>
                    <Form.Text className="d-block mt-1 mb-2">
                        {translator.translate("Ladda ner en säkerhetskopia av all din data, eller importera data från en tidigare nedladdning. Detta kan användas för att spara inställningar, dina anteckningar, dina självvärderingar, och annan information du samlat ihop. T.ex. kan detta användas när du inte använder en molntjänst som t.ex OneDrive, men vill kunna ta med den här informationen till en ny dator, eller telefon.")}
                    </Form.Text>
                    <div className="d-flex gap-2">
                        <Button variant="outline-secondary" size="sm" onClick={exportData}>
                            <Download className="me-2" />
                            {translator.translate("Ladda ner")}
                        </Button>
                        <Button variant="outline-secondary" size="sm" onClick={importData}>
                            <Upload className="me-2" />
                            {translator.translate("Importera")}
                        </Button>
                    </div>
                </Form.Group>
            )}
        </div>
    )
}

const providerDisplayName: Record<string, string> = {
    "google":    "Google",
    "microsoft": "Microsoft",
};

const AccountStatus = (props: { translator: Translator; onShowLogin: () => void }) => {
    const { translator, onShowLogin } = props;
    const [userInfo, setUserInfo] = useState(() => getSyncManager().getBackendUserInfo());
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [linkEmail, setLinkEmail] = useState("");
    const [linkError, setLinkError] = useState<string | null>(null);
    const [linkSuccess, setLinkSuccess] = useState(false);
    const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);

    // Refresh account info from /auth/me on mount. The email (code) login flow
    // doesn't reload the page, so the cached user info can be empty or stale when
    // this panel first renders (OIDC is covered by its post-login page reload).
    useEffect(() => {
        let cancelled = false;
        getSyncManager().refreshBackendUserInfo()
            .then(() => { if (!cancelled) setUserInfo(getSyncManager().getBackendUserInfo()); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    // Consume link_success / link_error stashed by the sync manager after the redirect.
    useEffect(() => {
        const success = sessionStorage.getItem("link_success");
        const err = sessionStorage.getItem("link_error");
        sessionStorage.removeItem("link_success");
        sessionStorage.removeItem("link_error");
        if (success) {
            setUserInfo(getSyncManager().getBackendUserInfo());
            setLinkEmail("");
            setLinkSuccess(true);
            const t = setTimeout(() => setLinkSuccess(false), 3500);
            return () => clearTimeout(t);
        }
        if (err === "already_linked") {
            setLinkError(translator.translate("Den här identiteten är redan kopplad till ett konto."));
        }
    }, [translator]);

    const handleLogout = () => {
        localStorage.removeItem("identity-choice-made");
        getSyncManager().disconnect();
        onShowLogin();
    };

    const handleExport = async () => {
        setExporting(true);
        setError(null);
        try {
            await getSyncManager().exportAccount();
        } catch {
            setError(translator.translate("Export misslyckades. Försök igen."));
        } finally {
            setExporting(false);
        }
    };

    const handleDeleteConfirm = async () => {
        setDeleting(true);
        setError(null);
        try {
            await getSyncManager().deleteAccount();
            localStorage.removeItem("identity-choice-made");
            onShowLogin();
        } catch {
            setError(translator.translate("Raderingen misslyckades. Försök igen."));
            setDeleting(false);
            setConfirmDelete(false);
        }
    };

    const handleLink = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = linkEmail.trim();
        if (!trimmed) return;
        setLinkError(null);
        getSyncManager().beginLinkAuthorization(trimmed);
    };

    const handleUnlink = async (provider: string) => {
        setUnlinkingProvider(provider);
        setError(null);
        try {
            await getSyncManager().unlinkProvider(provider);
            setUserInfo(getSyncManager().getBackendUserInfo());
        } catch (err) {
            if (err instanceof Error && err.message === "last-provider") {
                setError(translator.translate("Det går inte att koppla bort den enda inloggningsmetoden."));
            } else {
                setError(translator.translate("Kunde inte koppla bort kontot. Försök igen."));
            }
        } finally {
            setUnlinkingProvider(null);
        }
    };

    const canUnlink = (userInfo?.providers.length ?? 0) > 1;

    return (
        <>
            {userInfo && (
                <Form.Text className="d-block mt-1 mb-2">
                    {userInfo.displayName && <>{userInfo.displayName}<br /></>}
                    {userInfo.email}
                </Form.Text>
            )}

            {/* Linked identities */}
            <Form.Label className="mt-2 mb-1 fw-semibold">{translator.translate("Länkade inloggningssätt")}</Form.Label>
            {userInfo?.providers.map(p => (
                <div key={p} className="d-flex align-items-center gap-2 mb-1">
                    <span className="text-body-secondary" style={{ minWidth: "6rem" }}>{p === "email" ? translator.translate("E-post") : (providerDisplayName[p] ?? p)}</span>
                    <Button
                        variant="outline-secondary"
                        size="sm"
                        disabled={!canUnlink || unlinkingProvider !== null}
                        onClick={() => { void handleUnlink(p); }}
                    >
                        {unlinkingProvider === p ? "…" : translator.translate("Koppla bort")}
                    </Button>
                </div>
            ))}

            {/* Link another account */}
            <Form as="form" onSubmit={(e) => handleLink(e)} className="mt-2 mb-3 d-flex gap-2 align-items-start flex-wrap">
                <div style={{ flex: "1 1 12rem" }}>
                    <Form.Control
                        type="email"
                        size="sm"
                        placeholder="namn@example.com"
                        value={linkEmail}
                        onChange={e => { setLinkEmail(e.target.value); setLinkError(null); }}
                        isInvalid={linkError !== null}
                        isValid={linkSuccess}
                    />
                    {linkError && <Form.Control.Feedback type="invalid">{linkError}</Form.Control.Feedback>}
                    {linkSuccess && <Form.Control.Feedback type="valid">{translator.translate("Konto länkat!")}</Form.Control.Feedback>}
                </div>
                <Button type="submit" variant="outline-primary" size="sm" disabled={!linkEmail.trim()}>
                    {translator.translate("Länka")}
                </Button>
            </Form>

            {error && (
                <Form.Text className="d-block mt-1 mb-2 text-danger">{error}</Form.Text>
            )}
            {!confirmDelete ? (
                <div className="mt-1 d-flex gap-2 flex-wrap">
                    <Button variant="outline-secondary" size="sm" onClick={handleLogout}>
                        {translator.translate("Logga ut")}
                    </Button>
                    <Button variant="outline-secondary" size="sm" onClick={() => { void handleExport(); }} disabled={exporting}>
                        {exporting ? translator.translate("Exporterar...") : translator.translate("Exportera mina data")}
                    </Button>
                    <Button variant="outline-danger" size="sm" onClick={() => setConfirmDelete(true)}>
                        {translator.translate("Radera konto")}
                    </Button>
                </div>
            ) : (
                <div className="mt-1">
                    <Form.Text className="d-block mb-2 text-danger">
                        <strong>{translator.translate("Det här kan inte ångras.")}</strong>{" "}
                        {translator.translate("All din data på servern raderas permanent.")}
                    </Form.Text>
                    <div className="d-flex gap-2">
                        <Button variant="danger" size="sm" onClick={() => { void handleDeleteConfirm(); }} disabled={deleting}>
                            {deleting ? translator.translate("Raderar...") : translator.translate("Ja, radera mitt konto")}
                        </Button>
                        <Button variant="outline-secondary" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                            {translator.translate("Avbryt")}
                        </Button>
                    </div>
                </div>
            )}
        </>
    );
}

// iOS Safari only allows Web Push when the PWA is installed to the Home Screen.
function isIOS(): boolean {
    const ua = navigator.userAgent;
    return /iphone|ipad|ipod/i.test(ua)
        // iPadOS 13+ reports as a Mac; the touch points give it away.
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const NotificationPermissionControl = ({ translator }: { translator: Translator }) => {
    const [permission, setPermission] = useState<NotificationPermission>(
        () => ('Notification' in window ? Notification.permission : 'denied')
    );
    const [subscribed, setSubscribed] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reflect the actual push subscription state for this device on mount.
    useEffect(() => {
        if (!isPushSupported()) {
            setSubscribed(false);
            return;
        }
        let cancelled = false;
        void getCurrentSubscription().then(sub => {
            if (!cancelled) setSubscribed(sub !== null);
        });
        return () => { cancelled = true; };
    }, []);

    const handleTestNotification = () => {
        void navigator.serviceWorker.ready.then(reg =>
            reg.showNotification(translator.translate("Ny version tillgänglig"), {
                body: translator.translate("Det här är en testnotis."),
                icon: '/android-chrome-192x192.png',
                badge: '/favicon-32x32.png',
                tag: 'test-notification',
            })
        )
    }

    const enable = async () => {
        setBusy(true);
        setError(null);
        try {
            let perm = Notification.permission;
            if (perm !== 'granted') perm = await Notification.requestPermission();
            setPermission(perm);
            if (perm !== 'granted') return;
            await subscribeToPush();
            setSubscribed(true);
        } catch {
            setError(translator.translate("Det gick inte att aktivera notiser. Försök igen."));
        } finally {
            setBusy(false);
        }
    };

    const disable = async () => {
        setBusy(true);
        setError(null);
        try {
            await unsubscribeFromPush();
            setSubscribed(false);
        } catch {
            setError(translator.translate("Det gick inte att aktivera notiser. Försök igen."));
        } finally {
            setBusy(false);
        }
    };

    // Web Push unsupported. On iOS-in-browser, point the user at Add to Home Screen;
    // otherwise the device simply can't do notifications.
    if (!isPushSupported()) {
        return (
            <Form.Text className="d-block mt-1">
                {isIOS() && !isStandalone()
                    ? translator.translate("Lägg till appen på hemskärmen för att kunna aktivera notiser.")
                    : translator.translate("Den här enheten stöder inte notiser.")}
            </Form.Text>
        );
    }

    if (permission === 'denied') {
        return (
            <Form.Text className="d-block mt-1">
                {translator.translate("Notiser är blockerade. Ändra i webbläsarens inställningar för att aktivera dem.")}
            </Form.Text>
        );
    }

    if (subscribed === null) {
        return null; // still resolving the current subscription state
    }

    if (subscribed) {
        return (
            <>
                <Form.Text className="d-block mt-1 mb-2">
                    {translator.translate("Notiser är aktiverade.")}
                </Form.Text>
                <div className="d-flex gap-2">
                    <Button variant="outline-secondary" size="sm" onClick={() => { void disable(); }} disabled={busy}>
                        {translator.translate("Inaktivera notiser")}
                    </Button>
                    {DEBUG && (
                        <Button variant="outline-warning" size="sm" onClick={handleTestNotification}>
                            {translator.translate("Visa en testnotis")}
                        </Button>
                    )}
                </div>
                {error && <Form.Text className="d-block mt-2 text-danger">{error}</Form.Text>}
            </>
        );
    }

    return (
        <>
            <Form.Text className="d-block mt-1 mb-2">
                {translator.translate("Aktivera notiser för att få ett meddelande i operativsystemet när en ny version av appen är tillgänglig.")}
            </Form.Text>
            <Button variant="outline-primary" size="sm" onClick={() => { void enable(); }} disabled={busy}>
                {translator.translate("Aktivera notiser")}
            </Button>
            {error && <Form.Text className="d-block mt-2 text-danger">{error}</Form.Text>}
        </>
    );
}

const ProviderLogo = (props: { logo?: string }) => {
    const { logo } = props;

    return logo
        ? <img src={logo} alt="" className="settings-provider-logo" />
        : <DeviceHdd className="settings-provider-logo-placeholder" aria-hidden="true" />;
}

export default Settings;
