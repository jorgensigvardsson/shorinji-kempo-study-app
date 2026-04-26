import { useEffect, useMemo, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { useSyncProvider, useSyncState, useTheme } from "./hooks";
import { getAppDataStore } from "./persistence/store";
import type { CurrentWeekAnchor, SyncProvider } from "./persistence/schema";
import type { Language, Translator } from "./i18n";
import { humanGradeName, type GradePlan, type GradeName } from "./data";
import { DefaultTextSize } from "./persistence/text-size";
import { getSyncManager } from "./sync/manager";
import { toLocalDateKey } from "./utilities/current-week";

interface Props {
    translator: Translator;
    grade: GradePlan;
    allGradePlans: GradePlan[];
    textSize: number;
    onSetLanguage: (lang: Language) => void;
    onSetGrade: (grade: GradePlan) => void;
    onSetTextSize: (textSize: number) => void;
}

const Settings = (props: Props) => {
    const { translator, grade, allGradePlans, textSize, onSetLanguage, onSetGrade, onSetTextSize } = props;
    const store = getAppDataStore();
    const { theme, setTheme } = useTheme();
    const { syncProvider, setSyncProvider } = useSyncProvider();
    const syncState = useSyncState();
    const [currentWeekAnchor, setCurrentWeekAnchor] = useState<CurrentWeekAnchor | null>(() => store.get("currentWeekAnchor"));
    const availableWeeks = useMemo(
        () => [...new Set(grade.weeks.map(week => week.week))].sort((a, b) => a - b),
        [grade]
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

    useEffect(() => store.subscribe("currentWeekAnchor", setCurrentWeekAnchor), [store]);

    const setAnchoredWeek = (week: number) => {
        store.set("currentWeekAnchor", {
            week,
            anchorDate: toLocalDateKey()
        });
    };
    
    return (
        <Form>
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

            <Form.Group className="mb-3" controlId="settingsLevel">
                <Form.Label>{translator.translate("Nivå")}</Form.Label>
                <Form.Select onChange={e => onSetGrade(allGradePlans.find(x => x.grade === e.target.value)!)} value={grade.grade}>
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
                    {translator.translate("Byt vecka för att ankra till dagens datum.")}
                </Form.Text>
                {currentWeekAnchor && (
                    <Form.Text className="d-block">
                        {translator.translate("Ankrad till")} {currentWeekAnchor.anchorDate}
                    </Form.Text>
                )}
            </Form.Group>

            <Form.Group className="mb-3" controlId="settingsSyncProvider">
                <Form.Label>{translator.translate("Synk")}</Form.Label>
                {!isConnected && (
                    <>
                        <Form.Select value={syncProvider} onChange={e => setSyncProvider(e.target.value as SyncProvider)}>
                            <option value="local">{translator.translate("Ingen")}</option>
                            <option value="onedrive">OneDrive</option>
                            <option value="google-drive">Google Drive</option>
                            <option value="dropbox">Dropbox</option>
                        </Form.Select>
                        {syncProvider !== "local" && (
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
        </Form>
    )
}

export default Settings;
