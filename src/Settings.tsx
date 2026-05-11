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
import { DeviceHdd, Download, Upload } from "react-bootstrap-icons";
import "./Settings.css";

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
    const { syncProvider, setSyncProvider } = useSyncProvider();
    const syncState = useSyncState();
    const [currentWeekAnchor, setCurrentWeekAnchor] = useState<CurrentWeekAnchor | null>(() => store.get("currentWeekAnchor"));
    const [kenshiNumber, setKenshiNumber] = useState(() => store.get("kenshiNumber"));
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
/* TODO: implement syncing with these providers
        { value: "google-drive", label: "Google Drive", logo: "/google-drive-logo.svg" },
        { value: "dropbox", label: "Dropbox", logo: "/dropbox-logo.svg" },
*/
    ];
    const selectedSyncProvider = syncProviderOptions.find(option => option.value === syncProvider) ?? syncProviderOptions[0];

    useEffect(() => store.subscribe("currentWeekAnchor", setCurrentWeekAnchor), [store]);
    useEffect(() => store.subscribe("kenshiNumber", setKenshiNumber), [store]);

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
                                {syncState.status === "auth_expired" && syncProvider === "onedrive" && (
                                    <Form.Text className="d-block mt-2 text-warning">
                                        {translator.translate("Anslutningen till {0} har gått ut.", { params: ["OneDrive"] })}
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
            </Form.Group>
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
        </div>
    )
}

const ProviderLogo = (props: { logo?: string }) => {
    const { logo } = props;

    return logo
        ? <img src={logo} alt="" className="settings-provider-logo" />
        : <DeviceHdd className="settings-provider-logo-placeholder" aria-hidden="true" />;
}

export default Settings;
