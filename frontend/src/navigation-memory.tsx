import { useContext, useEffect, useMemo, type ReactNode } from "react";
import { Collection } from "react-bootstrap-icons";
import { useLocation, useNavigate } from "react-router-dom";
import { nextGrade, type GradeName, type GradePlan } from "./data";
import { BrowserStateScope, useBrowserState } from "./browser-state";
import { activityForUrl, availableActivities, type Activity } from "./navigation";
import { techniqueCatalogue } from "./activity-search";
import { TranslatorContext } from "./i18n";
import { beginNavigation } from "./navigation-pending";
import { NavigationMemory, defaultPins, type Visit } from "./navigation-memory-context";
import { getTrainingControlContext } from "./training-controls-context";

const validPins = (value: unknown): value is string[] => Array.isArray(value)
    && value.length <= 30 && value.every(item => typeof item === "string" && !!activityForUrl(item) && !item.includes("?"));
const validVisits = (value: unknown): value is Visit[] => Array.isArray(value) && value.length <= 4
    && value.every(item => item && typeof item.url === "string" && item.url.length < 2000
        && (!!activityForUrl(item.url) || /^\/technique\/[^/?#]+$/.test(item.url)) && typeof item.grade === "string"
        && (nextGrade(item.grade) !== undefined || item.grade === "kudan"));

export function NavigationMemoryProvider({ account, grade, allGradePlans, onGradeChange, children }: {
    account: string; grade: GradeName; allGradePlans: GradePlan[]; onGradeChange: (grade: GradeName) => void; children: ReactNode;
}) {
    return <BrowserStateScope.Provider value={account}>
        <MemoryProvider key={account} grade={grade} allGradePlans={allGradePlans} onGradeChange={onGradeChange}>{children}</MemoryProvider>
    </BrowserStateScope.Provider>;
}

function MemoryProvider({ grade, allGradePlans, onGradeChange, children }: { grade: GradeName; allGradePlans: GradePlan[]; onGradeChange: (grade: GradeName) => void; children: ReactNode }) {
    const translator = useContext(TranslatorContext);
    const location = useLocation();
    const navigate = useNavigate();
    const [pins, setPins] = useBrowserState("pins", defaultPins, validPins, true);
    const [recent, setRecent] = useBrowserState<Visit[]>("recent", [], validVisits, true);
    const url = location.pathname + location.search;
    const available = availableActivities(translator.isJapanese);
    const techniques = useMemo(() => new Map(techniqueCatalogue(allGradePlans).map(({ hokei }) => {
        const path = `/technique/${encodeURIComponent(hokei.id)}`;
        return [path, { path, title: hokei.hokei_name, variations: hokei.variations, section: "Teori", icon: Collection } satisfies Activity];
    })), [allGradePlans]);
    const describe = (url: string) => available.find(activity => activity.path === url.split("?")[0]) ?? techniques.get(url);
    const active = !!describe(url);
    useEffect(() => {
        if (!active || (recent[0]?.url === url && recent[0]?.grade === grade)) return;
        setRecent([{ url, grade }, ...recent.filter(visit => visit.url.split("?")[0] !== location.pathname)].slice(0, 4));
    }, [active, url, grade, location.pathname, recent, setRecent]);

    return <NavigationMemory.Provider value={{
        pins: pins.filter(path => available.some(activity => activity.path === path)),
        recent: recent.filter(visit => !!describe(visit.url)),
        describe,
        togglePin: path => {
            if (available.some(activity => activity.path === path))
                setPins(pins.includes(path) ? pins.filter(pin => pin !== path) : [...pins, path]);
        },
        resume: visit => {
            if (getTrainingControlContext(visit.url.split("?")[0]).showGrade) onGradeChange(visit.grade);
            beginNavigation(visit.url);
            navigate(visit.url, { state: { resumeActivity: true } });
        },
    }}>{children}</NavigationMemory.Provider>;
}
