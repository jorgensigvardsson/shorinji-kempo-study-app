import { useContext, useEffect, useRef, useState } from "react";
import { TranslatorContext, type Translator } from "./i18n";
import { type GradePlan, type GradeName, type StandardMoment, type HokeiMoment, type HokeiRef, type TanenKihonHokei, type Week, isHokeiRef, isHokeiMoment, isYondanWeek, isGodanWeek, isKyushoZemeWeek, adaptYondanMoment, adaptGodanMoment, adaptKyushoZeme } from "./data";
import HokeiCard from "./components/HokeiCard";
import VideoLink from "./components/VideoLink";
import tanenKihonHokeiData from "./assets/tanen_kihon_hokei.json";
import { findTanenMatches, tanenMatchesToVideos } from "./utilities/TanenUtils";

const tanenKihonHokeiMap = new Map<string, TanenKihonHokei>(
    (tanenKihonHokeiData as TanenKihonHokei[]).map(t => [t.hokei_name.trim(), t])
);
import { getAppDataStore } from "./persistence/store";
import type { CurrentWeekAnchor, WeeklyPlanCompletionEntry } from "./persistence/schema";
import { resolveCurrentWeekNumber, toLocalDateKey } from "./utilities/current-week";
import { ArrowCounterclockwise, ArrowLeft, ArrowRight, Check2, Circle } from "react-bootstrap-icons";
import { hokeiReferenceLabel, localizeSourceTerm, standardMomentLabel, weekIntroduction } from "./weekly-copy";
import "./Kamoku.css";

export interface Props {
    myGrade: GradeName;
    allGradePlans: GradePlan[];
    dojoMode?: boolean;
}

const Kamoku = (props: Props) => {
    const { myGrade, allGradePlans, dojoMode = false } = props;
    const store = getAppDataStore();
    const grade = allGradePlans.find(l => l.grade === myGrade) ?? allGradePlans[0];
    const [currentWeekAnchor, setCurrentWeekAnchor] = useState<CurrentWeekAnchor | null>(() => store.get("currentWeekAnchor"));
    const [weeklyPlanCompletions, setWeeklyPlanCompletions] = useState(() => store.get("weeklyPlanCompletions"));
    const [todayKey, setTodayKey] = useState(() => toLocalDateKey());
    const [selectedWeek, setSelectedWeek] = useState(() => findSelectedWeekIndex(grade, currentWeekAnchor, toLocalDateKey()));
    const translator = useContext(TranslatorContext);

    useEffect(() => store.subscribe("currentWeekAnchor", setCurrentWeekAnchor), [store]);
    useEffect(() => store.subscribe("weeklyPlanCompletions", setWeeklyPlanCompletions), [store]);

    useEffect(() => {
        setSelectedWeek(findSelectedWeekIndex(grade, currentWeekAnchor, todayKey));
    }, [grade, currentWeekAnchor, todayKey]);

    useEffect(() => {
        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 0, 0);
        const delay = Math.max(1000, nextMidnight.getTime() - now.getTime() + 100);

        const timerId = window.setTimeout(() => {
            setTodayKey(toLocalDateKey());
        }, delay);

        return () => window.clearTimeout(timerId);
    }, [todayKey]);

    const visibleWeekIndex = Math.min(selectedWeek, grade.weeks.length - 1);
    const selectedWeekData = grade.weeks[visibleWeekIndex];
    const selectedWeekNumber = selectedWeekData.week;
    const foundationalWeek = selectedWeekData.type === "kihon_only" || selectedWeekData.type === "regular_week"
        ? selectedWeekData
        : null;
    const basicReferences = (foundationalWeek?.kihon_shoho ?? []).filter(isHokeiRef);
    const hokeiExercises = foundationalWeek
        ? foundationalWeek.moments.filter(isHokeiMoment).map((hokei, index) => ({
            key: `${grade.grade}.${selectedWeekNumber}.hokei.${index}.${hokei.hokei_name}`,
            hokei,
        }))
        : [];
    const yondanWeek = isYondanWeek(selectedWeekData) ? selectedWeekData : null;
    const godanWeek = isGodanWeek(selectedWeekData) ? selectedWeekData : null;
    const kyushoZemeWeek = isKyushoZemeWeek(selectedWeekData) ? selectedWeekData : null;
    const primaryTechniques = [
        ...hokeiExercises,
        ...(yondanWeek?.moment ? [{ key: `${grade.grade}.${selectedWeekNumber}.yondan`, hokei: adaptYondanMoment(yondanWeek.moment) }] : []),
        ...(godanWeek ? [{ key: `${grade.grade}.${selectedWeekNumber}.godan`, hokei: adaptGodanMoment(godanWeek.moment) }] : []),
        ...(kyushoZemeWeek ? [{ key: `${grade.grade}.${selectedWeekNumber}.kyusho`, hokei: adaptKyushoZeme(kyushoZemeWeek.zeme) }] : []),
    ];
    const completionKey = weeklyPlanCompletionKey(grade.grade, selectedWeekNumber);
    const completion = weeklyPlanCompletions[completionKey];

    const markWeekCompleted = () => {
        store.set("weeklyPlanCompletions", {
            ...weeklyPlanCompletions,
            [completionKey]: { completedAt: new Date().toISOString() },
        });
    };

    const clearWeekCompletion = () => {
        const nextCompletions = { ...weeklyPlanCompletions };
        delete nextCompletions[completionKey];
        store.set("weeklyPlanCompletions", nextCompletions);
    };


    return (
        <div className={`kamoku-page${dojoMode ? " is-dojo-mode dojo-readable-hokei" : ""}`}>
            <header className="kamoku-page-header">
                <h1 className="app-page-heading">{translator.translate("Veckoplan")}</h1>
                {!dojoMode && <p className="app-intro-copy">{weekIntroduction(selectedWeekData, translator)}</p>}
            </header>
            <div className="kamoku-controls training-view-controls mb-4">
                <div className="kamoku-week-navigation">
                    <button
                        type="button"
                        className="kamoku-week-button kamoku-week-button-previous"
                        aria-label={translator.translate("Föregående vecka")}
                        disabled={visibleWeekIndex === 0}
                        onClick={() => setSelectedWeek(visibleWeekIndex - 1)}
                    >
                        <ArrowLeft aria-hidden="true" />
                        <span>{translator.translate("Föregående")}</span>
                    </button>
                    <div className="kamoku-week-center">
                        <span className="kamoku-week-position">
                            <span>{translator.translate("Vecka")} {selectedWeekNumber}</span>
                            <span className="kamoku-week-total"> {translator.translate("av")} {grade.weeks.length}</span>
                        </span>
                        <WeekCompletionControl
                            key={completionKey}
                            completion={completion}
                            grade={grade.grade}
                            week={selectedWeekNumber}
                            translator={translator}
                            onMark={markWeekCompleted}
                            onClear={clearWeekCompletion}
                        />
                    </div>
                    <button
                        type="button"
                        className="kamoku-week-button kamoku-week-button-next"
                        aria-label={translator.translate("Nästa vecka")}
                        disabled={visibleWeekIndex === grade.weeks.length - 1}
                        onClick={() => setSelectedWeek(visibleWeekIndex + 1)}
                    >
                        <span>{translator.translate("Nästa")}</span>
                        <ArrowRight aria-hidden="true" />
                    </button>
                </div>
            </div>
            <WeeklyFocus week={selectedWeekData} translator={translator} dojoMode={dojoMode} />
            {basicReferences.length > 0 && (
                <ReferencedTechniqueSection
                    title="Repetitionstekniker"
                    entries={basicReferences}
                    allGradePlans={allGradePlans}
                    dojoMode={dojoMode}
                />
            )}
            {yondanWeek && (
                <ReferencedTechniqueSection
                    title="Studera och undervisa"
                    entries={yondanWeek.study_teach}
                    allGradePlans={allGradePlans}
                    dojoMode={dojoMode}
                />
            )}
            {primaryTechniques.length > 0 && (
                <section className="kamoku-technique-section" aria-labelledby="kamoku-techniques-heading">
                    <h2 id="kamoku-techniques-heading" className="app-eyebrow-heading kamoku-section-title">{translator.translate("Tekniker")}</h2>
                    {primaryTechniques.map(entry => (
                        <HokeiCard key={entry.key} hokei={entry.hokei} className="mt-2" showNotes showRating dojoMode={dojoMode} kamokuLayout />
                    ))}
                </section>
            )}
        </div>
    )
}

const weeklyPlanCompletionKey = (grade: GradeName, week: number): string => `${grade}|${week}`;

interface WeekCompletionControlProps {
    completion?: WeeklyPlanCompletionEntry;
    grade: GradeName;
    week: number;
    translator: Translator;
    onMark: () => void;
    onClear: () => void;
}

const WeekCompletionControl = ({ completion, grade, week, translator, onMark, onClear }: WeekCompletionControlProps) => {
    const [detailsMode, setDetailsMode] = useState<"closed" | "preview" | "pinned">("closed");
    const groupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (detailsMode === "closed") return;

        const closeOutside = (event: PointerEvent) => {
            if (!groupRef.current?.contains(event.target as Node)) setDetailsMode("closed");
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setDetailsMode("closed");
        };
        document.addEventListener("pointerdown", closeOutside);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOutside);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [detailsMode]);

    if (!completion) {
        return (
            <button type="button" className="kamoku-week-completion" onClick={onMark}>
                <Circle aria-hidden="true" />
                <span>{translator.translate("Markera som tränad")}</span>
            </button>
        );
    }

    const completedLabel = translator.translate("Klarmarkerad {0}", {
        params: [formatCompletionDate(completion.completedAt, translator.currentLanguage)],
    });
    const detailsId = `week-completion-${grade.replace(/\s+/g, "-")}-${week}`;
    const detailsAreOpen = detailsMode !== "closed";

    return (
        <div
            ref={groupRef}
            className="kamoku-week-completion-group"
            onPointerEnter={event => {
                if (event.pointerType === "mouse") {
                    setDetailsMode(current => current === "closed" ? "preview" : current);
                }
            }}
            onPointerLeave={event => {
                if (event.pointerType === "mouse") {
                    setDetailsMode(current => current === "preview" ? "closed" : current);
                }
            }}
            onFocusCapture={() => setDetailsMode(current => current === "closed" ? "preview" : current)}
            onBlurCapture={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDetailsMode("closed");
            }}
        >
            <button
                type="button"
                className="kamoku-week-completion is-complete"
                aria-label={translator.translate("Visa när vecka {0} klarmarkerades", { params: [String(week)] })}
                aria-expanded={detailsAreOpen}
                aria-controls={detailsId}
                onClick={() => setDetailsMode(current => current === "pinned" ? "closed" : "pinned")}
            >
                <Check2 aria-hidden="true" />
                <span>{translator.translate("Tränad")}</span>
            </button>
            {detailsAreOpen && (
                <div id={detailsId} className="kamoku-week-completion-details" role="dialog" aria-label={completedLabel}>
                    <span>{completedLabel}</span>
                <button
                    type="button"
                    className="kamoku-week-completion-clear"
                    onClick={() => {
                        setDetailsMode("closed");
                        onClear();
                    }}
                >
                    <ArrowCounterclockwise aria-hidden="true" />
                    <span>{translator.translate("Ta bort klarmarkering")}</span>
                </button>
                </div>
            )}
        </div>
    );
};

const formatCompletionDate = (value: string, language: Translator["currentLanguage"]): string => {
    const locale = language === "sv" ? "sv-SE" : language === "en" ? "en-GB" : language === "tr" ? "tr-TR" : "ja-JP";
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
};

interface FocusLine {
    key: string;
    primary: string;
    japanese?: string;
}

interface FocusGroup {
    title: string;
    lines: FocusLine[];
}

const WeeklyFocus = ({ week, translator, dojoMode }: { week: Week; translator: Translator; dojoMode: boolean }) => {
    const showKanji = !dojoMode && !translator.isJapanese;
    const groups: FocusGroup[] = [];
    let sourceStrings: string[] = [];

    if (week.type === "regular_week" || week.type === "kihon_only") {
        const kihonEntries = week.kihon_shoho ?? [];
        sourceStrings = kihonEntries.filter((entry): entry is string => typeof entry === "string");
        const references = kihonEntries.filter(isHokeiRef);
        const standardMoments = week.moments.filter((moment): moment is StandardMoment => moment.type === "standard_moment");

        if (sourceStrings.length > 0) {
            groups.push({
                title: "Veckans grundarbete",
                lines: sourceStrings.map((value, index) => focusLine(`basic-${index}`, value, translator, showKanji)),
            });
        }
        if (references.length > 0) {
            groups.push({
                title: "Repetitionstekniker",
                lines: references.map((entry, index) => ({
                    key: `reference-${index}`,
                    primary: hokeiReferenceLabel(entry, translator, false),
                    japanese: japaneseFocusLabel(hokeiReferenceLabel(entry, translator, true), showKanji),
                })),
            });
        }
        if (standardMoments.length > 0) {
            groups.push({
                title: "Återkommande delar",
                lines: standardMoments.map((moment, index) => ({
                    key: `standard-${index}`,
                    primary: standardMomentLabel(moment, translator, false),
                    japanese: japaneseFocusLabel(standardMomentLabel(moment, translator, true), showKanji),
                })),
            });
        }
    } else if (week.type === "review_preparation_week") {
        groups.push({
            title: "Veckans fokus",
            lines: week.content.map((value, index) => focusLine(`review-${index}`, value, translator, showKanji)),
        });
    } else if (week.type === "yondan_week") {
        groups.push({
            title: "Studera och undervisa",
            lines: week.study_teach.map((entry, index) => ({
                key: `study-${index}`,
                primary: hokeiReferenceLabel(entry, translator, false),
                japanese: japaneseFocusLabel(hokeiReferenceLabel(entry, translator, true), showKanji),
            })),
        });
    }

    const videos = tanenMatchesToVideos(
        sourceStrings.flatMap(entry => findTanenMatches(entry, tanenKihonHokeiMap)),
    );

    if (groups.length === 0 && videos.length === 0) return null;

    return (
        <section className="kamoku-week-focus" aria-labelledby="kamoku-week-focus-heading">
            <h2 id="kamoku-week-focus-heading" className="visually-hidden">
                {translator.translate("Veckans innehåll")}
            </h2>
            <div className="kamoku-focus-groups">
                {groups.map(group => (
                    <section key={group.title} className="kamoku-focus-group">
                        <h3 className="app-eyebrow-heading">{translator.translate(group.title)}</h3>
                        <ul>
                            {group.lines.map(line => (
                                <li key={line.key}>
                                    <span>{line.primary}</span>
                                    {line.japanese && <span className="kamoku-focus-japanese">{line.japanese}</span>}
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
                {videos.length > 0 && (
                    <section className="kamoku-focus-group kamoku-focus-videos">
                        <h3 className="app-eyebrow-heading">{translator.translate("Videostöd")}</h3>
                        {videos.map(video => <VideoLink key={video.url} video={video} className="kamoku-focus-video" />)}
                    </section>
                )}
            </div>
        </section>
    );
};

interface ReferencedTechniqueSectionProps {
    title: string;
    entries: HokeiRef[];
    allGradePlans: GradePlan[];
    dojoMode: boolean;
}

const ReferencedTechniqueSection = ({ title, entries, allGradePlans, dojoMode }: ReferencedTechniqueSectionProps) => {
    const translator = useContext(TranslatorContext);
    const techniques = entries.flatMap((entry, index) => {
        const moment = allGradePlans
            .flatMap(plan => plan.weeks)
            .flatMap((week): HokeiMoment[] => "moments" in week ? week.moments.filter(isHokeiMoment) : [])
            .find(candidate => candidate.hokei_name === entry.hokei_ref);
        if (!moment) return [];

        const hokei: HokeiMoment = entry.variants.length > 0
            ? { ...moment, variations: [...(moment.variations ?? []), ...entry.variants] }
            : moment;
        return [{ key: `${title}.${entry.hokei_ref}.${index}`, hokei }];
    });

    if (techniques.length === 0) return null;

    return (
        <section className="kamoku-technique-section">
            <h2 className="app-eyebrow-heading kamoku-section-title">{translator.translate(title)}</h2>
            {techniques.map(entry => (
                <HokeiCard key={entry.key} hokei={entry.hokei} className="mt-2" showNotes showRating dojoMode={dojoMode} kamokuLayout />
            ))}
        </section>
    );
};

const focusLine = (key: string, value: string, translator: Translator, showKanji: boolean): FocusLine => ({
    key,
    primary: localizeSourceTerm(value, translator, false),
    japanese: japaneseFocusLabel(localizeSourceTerm(value, translator, true), showKanji),
});

const japaneseFocusLabel = (value: string, showKanji: boolean): string | undefined =>
    showKanji && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)
        ? value
        : undefined;

export default Kamoku;

function findSelectedWeekIndex(grade: GradePlan, anchor: CurrentWeekAnchor | null, todayKey: string): number {
    if (grade.weeks.length === 0) {
        return 0;
    }

    const weekNumber = resolveCurrentWeekNumber(anchor, grade.weeks.length, todayKey);
    const index = grade.weeks.findIndex(week => week.week === weekNumber);
    return index >= 0 ? index : 0;
}
