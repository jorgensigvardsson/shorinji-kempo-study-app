import { useEffect, useState } from "react";
import { Button, Dropdown, Form } from "react-bootstrap";
import "./Settings.css";
import { useTheme } from "./hooks";
import { getAppDataStore } from "./persistence/store";
import { APP_DISPLAY_NAME_MAX_LENGTH, canonicalKenshiNumber, formatKenshiNumber, isCompleteKenshiNumber, isKenshiNumber, normalizeKenshiNumber } from "./persistence/schema";
import type { Language, Translator } from "./i18n";
import { humanGradeName, type GradePlan, type GradeName } from "./data";
import { DefaultTextSize } from "./persistence/text-size";
import { getSyncManager } from "./sync/manager";
import { getCurrentSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from "./push";
import { ensureAllTranslations } from "./translations";
import { ArrowRepeat, Download, Upload } from "react-bootstrap-icons";
import Loading from "./components/Loading";
import { resetAppInstallation } from "./app-update";

const DEBUG = import.meta.env.VITE_DEBUG === "true";

const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) || "dev";

const textSizeOptions = [
    { value: 1.0, label: "Liten" },
    { value: DefaultTextSize, label: "Mindre" },
    { value: 1.2, label: "Medium" },
    { value: 1.3, label: "Större" },
    { value: 1.4, label: "Störst" },
] as const;

interface Props {
    translator: Translator;
    nextGrade: GradePlan;
    allGradePlans: GradePlan[];
    textSize: number;
    onSetLanguage: (lang: Language) => void;
    onSetGrade: (grade: GradePlan) => void;
    onSetTextSize: (textSize: number) => void;
}

const Settings = (props: Props) => {
    const { translator, nextGrade, allGradePlans, textSize, onSetLanguage, onSetGrade, onSetTextSize } = props;
    const store = getAppDataStore();
    const { theme, setTheme } = useTheme();
    const [appDisplayName, setAppDisplayName] = useState<string | null>(() => store.get("appDisplayName"));
    const [accountDisplayName, setAccountDisplayName] = useState(() => getSyncManager().getBackendUserInfo()?.displayName ?? "");
    // The field keeps the raw text so that what is typed stays put while it is being
    // typed; only a valid number reaches the store. Anything else is flagged instead
    // of being stored and quietly dropped the next time the document is loaded. The
    // grouping is applied on the way in and when leaving the field, never mid-keystroke,
    // so it cannot move the cursor around while the number is being written.
    const [kenshiNumberText, setKenshiNumberText] = useState(() => formatKenshiNumber(store.get("kenshiNumber") ?? ""));
    // A number is half-written for most of the time it is being typed, so its length is
    // only worth complaining about once the field is left. A character that can never
    // belong to a kenshi number is worth saying something about right away.
    const [kenshiNumberLeft, setKenshiNumberLeft] = useState(false);
    const kenshiNumberDigits = normalizeKenshiNumber(kenshiNumberText);
    const kenshiNumberError = kenshiNumberText.trim().length === 0
        ? null
        : !isKenshiNumber(kenshiNumberDigits)
            ? translator.translate("Ett kenshinummer består bara av siffror.")
            : (kenshiNumberLeft && !isCompleteKenshiNumber(kenshiNumberDigits))
                ? translator.translate("Ett kenshinummer består av 9 eller 10 siffror, till exempel 123-456789.")
                : null;
    // `name` is what the language calls itself, and is deliberately a constant rather
    // than a lookup in that language's own section: a language's own name is not a
    // translation of the interface, and treating it as one meant every section had to
    // be loaded just to draw this list. `key` is still translated, because "Turkiska"
    // does change with the language the reader is using.
    // This is the one place a language gets chosen, so fetch the sections that do not
    // ship with the app now rather than when the choice is made — otherwise picking
    // Turkish shows the Swedish source text until its section lands.
    useEffect(() => { void ensureAllTranslations(); }, []);

    const languages: { code: Language; key: string; name: string }[] = [
        { code: "sv", key: "Svenska", name: "Svenska" },
        { code: "en", key: "Engelska", name: "English" },
        { code: "tr", key: "Turkiska", name: "Türkçe" },
        { code: "ja", key: "Japanska", name: "日本語" },
    ];

    const gradeLabel = (name: GradeName) => {
        const humanName = humanGradeName(name);

        if (!translator.isJapanese)
            return `${translator.translate(humanName, { capitalize: true })} (${translator.japanese(humanName)})`;

        return translator.japanese(humanName);
    }

    useEffect(() => store.subscribe("appDisplayName", setAppDisplayName), [store]);
    // Follow the store only when it lands somewhere other than what this field already
    // holds — a sync or another tab. Writes made from here must not rewrite the text
    // mid-typing.
    useEffect(() => store.subscribe("kenshiNumber", stored => {
        setKenshiNumberText(current => canonicalKenshiNumber(current) === (stored ?? "") ? current : formatKenshiNumber(stored ?? ""));
    }), [store]);

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

    const displayedAppName = (appDisplayName ?? accountDisplayName).slice(0, APP_DISPLAY_NAME_MAX_LENGTH);

    return (
        <main className="settings-page">
            <header className="settings-page-header">
                <h1 className="app-page-heading">{translator.translate("Inställningar")}</h1>
                <p className="app-intro-copy">{translator.translate("Här samlar du hur appen ser ut, vem du är och hur ditt konto fungerar.")}</p>
            </header>

            <div className="settings-sections">
                <section className="settings-section" aria-labelledby="settings-appearance-heading">
                    <div className="settings-section-header">
                        <h2 id="settings-appearance-heading" className="app-section-heading">{translator.translate("Utseende")}</h2>
                    </div>
                    <div className="settings-form-grid settings-form-grid-three">
                        <Form.Group controlId="settingsTheme">
                            <Form.Label>{translator.translate("Tema")}</Form.Label>
                            <Form.Select value={theme} onChange={e => setTheme(e.target.value as "light" | "dark" | "system")}>
                                <option value="light">{translator.translate("Ljust")}</option>
                                <option value="dark">{translator.translate("Mörkt")}</option>
                                <option value="system">{translator.translate("System")}</option>
                            </Form.Select>
                        </Form.Group>

                        <Form.Group controlId="settingsLanguage">
                            <Form.Label>{translator.translate("Språk")}</Form.Label>
                            <Form.Select onChange={e => onSetLanguage(e.target.value as Language)} value={translator.currentLanguage}>
                                {languages.map(language => (
                                    <option value={language.code} key={language.code}>
                                        {language.name} ({translator.translate(language.key)})
                                    </option>
                                ))}
                            </Form.Select>
                        </Form.Group>

                        <Form.Group controlId="textSize">
                            <Form.Label>{translator.translate("Textstorlek")}</Form.Label>
                            {/* A native select hands its menu to the operating system on many
                                phones, which ignores option font sizes. This HTML dropdown keeps
                                the preview visible everywhere. The whole app is already zoomed to
                                the current choice, so dividing by it makes each row land at the
                                size it will actually have after it is selected. */}
                            <Dropdown className="settings-text-size-dropdown" onSelect={key => {
                                const selected = Number(key);
                                if (Number.isFinite(selected)) onSetTextSize(selected);
                            }}>
                                <Dropdown.Toggle id="textSize" variant="outline-secondary">
                                    {translator.translate(textSizeOptions.find(option => option.value === textSize)?.label ?? "Medium")}
                                </Dropdown.Toggle>
                                <Dropdown.Menu>
                                    {textSizeOptions.map(option => (
                                        <Dropdown.Item
                                            key={option.value}
                                            eventKey={String(option.value)}
                                            active={option.value === textSize}
                                            style={{ fontSize: `${option.value / textSize}rem` }}
                                        >
                                            {translator.translate(option.label)}
                                        </Dropdown.Item>
                                    ))}
                                </Dropdown.Menu>
                            </Dropdown>
                        </Form.Group>
                    </div>
                </section>

                <section className="settings-section" aria-labelledby="settings-profile-heading">
                    <div className="settings-section-header">
                        <h2 id="settings-profile-heading" className="app-section-heading">{translator.translate("Om mig")}</h2>
                    </div>
                    <div className="settings-form-grid">
                        <Form.Group className="settings-field-wide" controlId="settingsAppDisplayName">
                            <Form.Label>{translator.translate("Namn i appen")}</Form.Label>
                            <Form.Control
                                type="text"
                                autoComplete="name"
                                maxLength={APP_DISPLAY_NAME_MAX_LENGTH}
                                value={displayedAppName}
                                onChange={e => store.set("appDisplayName", e.target.value.slice(0, APP_DISPLAY_NAME_MAX_LENGTH))}
                                onBlur={e => store.set("appDisplayName", e.target.value.trim())}
                            />
                            <Form.Text className="d-block mt-2">
                                {translator.translate("Det här namnet synkas mellan dina enheter men ändrar bara namnet i appen.")}
                            </Form.Text>
                            {appDisplayName !== null && accountDisplayName.trim() && (
                                <Button className="mt-2" variant="link" size="sm" onClick={() => store.set("appDisplayName", null)}>
                                    {translator.translate("Använd kontots namn")}
                                </Button>
                            )}
                        </Form.Group>

                        <Form.Group controlId="settingsKenshiNumber">
                            <Form.Label>{translator.translate("Kenshinummer")}</Form.Label>
                            <Form.Control
                                type="text"
                                inputMode="numeric"
                                autoComplete="off"
                                value={kenshiNumberText}
                                isInvalid={kenshiNumberError !== null}
                                onChange={e => {
                                    const text = e.target.value ?? "";
                                    setKenshiNumberText(text);
                                    setKenshiNumberLeft(false);
                                    const typedDigits = normalizeKenshiNumber(text);
                                    if (typedDigits.length === 0) {
                                        store.set("kenshiNumber", undefined);
                                    } else if (isCompleteKenshiNumber(typedDigits)) {
                                        store.set("kenshiNumber", canonicalKenshiNumber(typedDigits));
                                    }
                                }}
                                onBlur={() => {
                                    setKenshiNumberLeft(true);
                                    if (isCompleteKenshiNumber(kenshiNumberDigits)) {
                                        setKenshiNumberText(formatKenshiNumber(kenshiNumberDigits));
                                    }
                                }}
                            />
                            <Form.Control.Feedback type="invalid">{kenshiNumberError}</Form.Control.Feedback>
                        </Form.Group>

                        <Form.Group controlId="settingsLevel">
                            <Form.Label>{translator.translate("Min nästa grad")}</Form.Label>
                            <Form.Select onChange={e => {
                                const plan = allGradePlans.find(x => x.grade === e.target.value);
                                if (plan) onSetGrade(plan);
                            }} value={nextGrade.grade}>
                                {allGradePlans.map((plan, index) => (
                                    <option value={plan.grade} key={index}>{gradeLabel(plan.grade)}</option>
                                ))}
                            </Form.Select>
                        </Form.Group>
                    </div>
                </section>

                <section className="settings-section" aria-labelledby="settings-notifications-heading">
                    <div className="settings-section-header">
                        <h2 id="settings-notifications-heading" className="app-section-heading">{translator.translate("Notiser")}</h2>
                    </div>
                    <Form.Group>
                        <Form.Label>{translator.translate("Uppdateringsnotiser")}</Form.Label>
                        <NotificationPermissionControl translator={translator} />
                    </Form.Group>
                </section>

                <section className="settings-section" aria-labelledby="settings-account-heading">
                    <div className="settings-section-header">
                        <h2 id="settings-account-heading" className="app-section-heading">{translator.translate("Konto och inloggning")}</h2>
                    </div>
                    <AccountStatus translator={translator} onAccountDisplayNameChange={setAccountDisplayName} />
                </section>

                <section className="settings-section" aria-labelledby="settings-backup-heading">
                    <div className="settings-section-header">
                        <h2 id="settings-backup-heading" className="app-section-heading">{translator.translate("Säkerhetskopia")}</h2>
                        <p>{translator.translate("Ladda ner en återläsningsbar kopia av dina inställningar och studiedata.")}</p>
                    </div>
                    <div className="d-flex gap-2 flex-wrap">
                        <Button variant="outline-secondary" size="sm" onClick={exportData}>
                            <Download className="me-2" />
                            {translator.translate("Ladda ner")}
                        </Button>
                        <Button variant="outline-secondary" size="sm" onClick={importData}>
                            <Upload className="me-2" />
                            {translator.translate("Importera")}
                        </Button>
                    </div>
                </section>

                <section className="settings-section" aria-labelledby="settings-app-heading">
                    <div className="settings-section-header">
                        <h2 id="settings-app-heading" className="app-section-heading">{translator.translate("Om appen")}</h2>
                    </div>
                    <AppInstallation translator={translator} />
                </section>
            </div>
        </main>
    );
}

// The manual way out of an app that will not update itself. The automatic recovery
// in app-update.ts should mean nobody ever needs this, but "should" is doing a lot of
// work in that sentence, and an installed app on a home screen may offer its user no
// other way to clear a service worker that has got stuck on an old build.
const AppInstallation = (props: { translator: Translator }) => {
    const { translator } = props;
    const [working, setWorking] = useState(false);

    const reinstall = () => {
        setWorking(true);
        // Ends in a reload, so there is no finally: clearing the flag first would only
        // re-enable the button for the moment before the page goes away.
        void resetAppInstallation();
    };

    return (
        <>
            <p className="settings-help-text">
                {translator.translate("Om appen fastnar på en gammal version kan du installera om den. Dina inställningar och studiedata påverkas inte — appen hämtas bara hem på nytt.")}
            </p>
            <div className="d-flex gap-2 flex-wrap align-items-center">
                <Button variant="outline-secondary" size="sm" onClick={reinstall} disabled={working}>
                    <ArrowRepeat className="me-2" />
                    {working ? translator.translate("Installerar om…") : translator.translate("Installera om appen")}
                </Button>
                {/* Not decoration: the first useful question about a device that is
                    behaving oddly is which build it is actually running. */}
                <small className="settings-help-text">
                    {translator.translate("Version")} <code>{appVersion.slice(0, 7)}</code>
                </small>
            </div>
        </>
    );
}

const providerDisplayName: Record<string, string> = {
    "google":    "Google",
    "microsoft": "Microsoft",
};

const AccountStatus = (props: { translator: Translator; onAccountDisplayNameChange: (name: string) => void }) => {
    const { translator, onAccountDisplayNameChange } = props;
    const [userInfo, setUserInfo] = useState(() => getSyncManager().getBackendUserInfo());
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [linkEmail, setLinkEmail] = useState("");
    const [linkError, setLinkError] = useState<string | null>(null);
    const [linkSuccess, setLinkSuccess] = useState(false);
    const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);
    const [loggingOutOthers, setLoggingOutOthers] = useState(false);
    const [othersMessage, setOthersMessage] = useState<string | null>(null);

    const [refreshFailed, setRefreshFailed] = useState(false);

    // Refresh account info from /auth/me on mount. The email (code) login flow
    // doesn't reload the page, so the cached user info can be empty or stale when
    // this panel first renders (OIDC is covered by its post-login page reload).
    // With something cached the refresh happens behind what is already on screen;
    // with nothing cached there is nothing to show but the wait itself, and on an
    // auth service that has scaled to zero that wait is seconds long.
    useEffect(() => {
        let cancelled = false;
        getSyncManager().refreshBackendUserInfo()
            .then(() => {
                if (cancelled) return;
                const refreshed = getSyncManager().getBackendUserInfo();
                setUserInfo(refreshed);
                onAccountDisplayNameChange(refreshed?.displayName ?? "");
            })
            .catch(() => { if (!cancelled) setRefreshFailed(true); });
        return () => { cancelled = true; };
    }, [onAccountDisplayNameChange]);

    // Consume link_success / link_error stashed by the sync manager after the redirect.
    useEffect(() => {
        const success = sessionStorage.getItem("link_success");
        const err = sessionStorage.getItem("link_error");
        sessionStorage.removeItem("link_success");
        sessionStorage.removeItem("link_error");
        if (success) {
            const refreshed = getSyncManager().getBackendUserInfo();
            setUserInfo(refreshed);
            onAccountDisplayNameChange(refreshed?.displayName ?? "");
            setLinkEmail("");
            setLinkSuccess(true);
            const t = setTimeout(() => setLinkSuccess(false), 3500);
            return () => clearTimeout(t);
        }
        if (err === "already_linked") {
            setLinkError(translator.translate("Den här identiteten är redan kopplad till ett konto."));
        }
    }, [onAccountDisplayNameChange, translator]);

    // Signing out flips the sync provider back to "local", which is what makes
    // App swap the whole UI for the login screen.
    const handleLogout = () => {
        getSyncManager().disconnect();
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
        } catch {
            setError(translator.translate("Raderingen misslyckades. Försök igen."));
            setDeleting(false);
            setConfirmDelete(false);
        }
    };

    const handleLogoutOthers = async () => {
        setLoggingOutOthers(true);
        setError(null);
        setOthersMessage(null);
        try {
            await getSyncManager().logoutOtherDevices();
            setOthersMessage(translator.translate("Du har loggats ut på alla andra enheter."));
        } catch (err) {
            if (err instanceof Error && err.message === "session-unidentified") {
                setError(translator.translate("Försök igen om en liten stund."));
            } else {
                setError(translator.translate("Kunde inte logga ut på andra enheter. Försök igen."));
            }
        } finally {
            setLoggingOutOthers(false);
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
                setError(translator.translate("Det går inte att ta bort det enda inloggningssättet."));
            } else {
                setError(translator.translate("Kunde inte ta bort inloggningssättet. Försök igen."));
            }
        } finally {
            setUnlinkingProvider(null);
        }
    };

    const canUnlink = (userInfo?.providers.length ?? 0) > 1;

    // Nothing has arrived and nothing is cached: every control below is about an
    // account this panel cannot describe yet, so the wait is all there is to show.
    if (userInfo === null && !refreshFailed) {
        return <Loading />;
    }

    return (
        <div className="settings-account">
            {userInfo === null && (
                <Form.Text className="d-block mt-1 mb-2 text-danger">
                    {translator.translate("Kunde inte hämta kontouppgifterna.")}
                </Form.Text>
            )}
            {userInfo && (
                <div className="settings-account-identity">
                    <span>{translator.translate("Inloggad som")}</span>
                    <strong>{userInfo.email}</strong>
                </div>
            )}

            <div className="settings-account-block">
                <h3 className="settings-subheading">{translator.translate("Inloggningssätt")}</h3>
                <p className="settings-help-text">
                    {translator.translate("Ett inloggningssätt är ett sätt att öppna samma konto. Tar du bort ett finns kontot och dina studiedata kvar.")}
                </p>
                <div className="settings-login-methods">
                    {userInfo?.providers.map(p => (
                        <div key={p} className="settings-login-method">
                            <span>{p === "email" ? translator.translate("E-post") : (providerDisplayName[p] ?? p)}</span>
                            {canUnlink ? (
                                <Button
                                    variant="outline-secondary"
                                    size="sm"
                                    disabled={unlinkingProvider !== null}
                                    onClick={() => { void handleUnlink(p); }}
                                >
                                    {unlinkingProvider === p ? "…" : translator.translate("Ta bort inloggningssätt")}
                                </Button>
                            ) : (
                                <small>{translator.translate("Ditt enda inloggningssätt")}</small>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="settings-account-block">
                <h3 className="settings-subheading">{translator.translate("Lägg till inloggningssätt")}</h3>
                <p className="settings-help-text">{translator.translate("Lägg till en annan e-postadress som du kan använda för samma konto.")}</p>
                <Form as="form" onSubmit={(e) => handleLink(e)} className="settings-link-form">
                    <div className="settings-link-input">
                        <Form.Label visuallyHidden htmlFor="settingsLinkEmail">{translator.translate("E-postadress")}</Form.Label>
                        <Form.Control
                            id="settingsLinkEmail"
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
                        {translator.translate("Lägg till")}
                    </Button>
                </Form>
            </div>

            {error && (
                <Form.Text className="d-block mt-1 mb-2 text-danger">{error}</Form.Text>
            )}
            {othersMessage && (
                <Form.Text className="d-block mt-1 mb-2 text-success">{othersMessage}</Form.Text>
            )}
            <div className="settings-account-block">
                <h3 className="settings-subheading">{translator.translate("Sessioner")}</h3>
                <div className="d-flex gap-2 flex-wrap">
                    <Button variant="outline-secondary" size="sm" onClick={handleLogout}>
                        {translator.translate("Logga ut")}
                    </Button>
                    <Button variant="outline-secondary" size="sm" onClick={() => { void handleLogoutOthers(); }} disabled={loggingOutOthers}>
                        {loggingOutOthers ? translator.translate("Loggar ut…") : translator.translate("Logga ut på alla andra enheter")}
                    </Button>
                </div>
            </div>

            <div className="settings-account-block">
                <h3 className="settings-subheading">{translator.translate("Fullständig kontokopia")}</h3>
                <p className="settings-help-text">{translator.translate("Ladda ner kontouppgifter och studiedata tillsammans. Den här filen är till för insyn, inte för återläsning i appen.")}</p>
                <Button variant="outline-secondary" size="sm" onClick={() => { void handleExport(); }} disabled={exporting}>
                    {exporting ? translator.translate("Exporterar...") : translator.translate("Ladda ner kontokopia")}
                </Button>
            </div>

            <div className="settings-danger-zone">
                {!confirmDelete ? (
                    <Button variant="outline-danger" size="sm" onClick={() => setConfirmDelete(true)}>
                        {translator.translate("Radera konto")}
                    </Button>
                ) : (
                    <div>
                        <Form.Text className="d-block mb-2 text-danger">
                            <strong>{translator.translate("Det här kan inte ångras.")}</strong>{" "}
                            {translator.translate("All din data på servern raderas permanent.")}
                        </Form.Text>
                        <div className="d-flex gap-2 flex-wrap">
                            <Button variant="danger" size="sm" onClick={() => { void handleDeleteConfirm(); }} disabled={deleting}>
                                {deleting ? translator.translate("Raderar...") : translator.translate("Ja, radera mitt konto")}
                            </Button>
                            <Button variant="outline-secondary" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                                {translator.translate("Avbryt")}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
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

export default Settings;
