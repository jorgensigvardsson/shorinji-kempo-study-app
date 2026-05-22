import { Form } from "react-bootstrap";
import { useContext, useEffect, useState } from "react";
import { TranslatorContext, type Translator } from "./i18n";
import { type GradePlan, type GradeName, type Week, type StandardMoment, type KihonShohoEntry, type HokeiMoment, type HokeiRef, type TanenKihonHokei, isHokeiRef, isHokeiMoment, isYondanWeek, isGodanWeek, isKyushoZemeWeek, adaptYondanMoment, adaptGodanMoment, adaptKyushoZeme } from "./data";
import CollapsibleCard from "./components/CollapsibleCard";
import { cardHead } from "./utilities/CardUtilities";
import HokeiCard from "./components/HokeiCard";
import VideoLink from "./components/VideoLink";
import type { HokeiNotes, HokeiRanks } from "./persistence/app-data";
import tanenKihonHokeiData from "./assets/tanen_kihon_hokei.json";
import { findTanenMatches, tanenMatchesToVideos } from "./utilities/TanenUtils";

const tanenKihonHokeiMap = new Map<string, TanenKihonHokei>(
    (tanenKihonHokeiData as TanenKihonHokei[]).map(t => [t.hokei_name.trim(), t])
);
import { getAppDataStore } from "./persistence/store";
import type { CurrentWeekAnchor } from "./persistence/schema";
import { gradeLabel } from "./strings";
import { resolveCurrentWeekNumber, toLocalDateKey } from "./utilities/current-week";

export interface Props {
    myGrade: GradeName;
    allGradePlans: GradePlan[];
    notesData: HokeiNotes;
    ranksData: HokeiRanks;
}

const Kamoku = (props: Props) => {
    const { myGrade, allGradePlans, notesData, ranksData } = props;
    const store = getAppDataStore();
    const initialGrade = allGradePlans.find(l => l.grade == myGrade)!;
    const [currentWeekAnchor, setCurrentWeekAnchor] = useState<CurrentWeekAnchor | null>(() => store.get("currentWeekAnchor"));
    const [todayKey, setTodayKey] = useState(() => toLocalDateKey());
    const [selectedWeek, setSelectedWeek] = useState(() => findSelectedWeekIndex(initialGrade, currentWeekAnchor, toLocalDateKey()));
    const translator = useContext(TranslatorContext);
    const [grade, setGrade] = useState<GradePlan>(initialGrade);

    const setNewGrade = (newGrade: GradePlan) => {
        setGrade(newGrade);
        setSelectedWeek(findSelectedWeekIndex(newGrade, currentWeekAnchor, todayKey));
    }

    useEffect(() => store.subscribe("currentWeekAnchor", setCurrentWeekAnchor), [store]);

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

    const optionLabel = (week: Week) => {
        if (!translator.isJapanese)
            return `${translator.translate("Vecka")} ${week.week} (${translator.japanese("Vecka")} ${translator.japanese(week.week)})`;
        return `${translator.translate("Vecka")} ${translator.translate(week.week)}`;
    }

    const basicExercises = grade.weeks[selectedWeek].type === "kihon_only" || grade.weeks[selectedWeek].type === "regular_week"
        ? (grade.weeks[selectedWeek].kihon_shoho ?? [])
        : null;

    const hokeiExercises = grade.weeks[selectedWeek].type === "kihon_only" || grade.weeks[selectedWeek].type === "regular_week"
        ? grade.weeks[selectedWeek].moments.filter(m => "hokei_name" in m).map((m, mi) => ({ key: `${grade.grade}.${selectedWeek}.${m.hokei_name}).${mi}`, hokei: m }))
        : null;

    const otherExercises = grade.weeks[selectedWeek].type === "kihon_only" || grade.weeks[selectedWeek].type === "regular_week"
        ? grade.weeks[selectedWeek].moments.filter(m => "type" in m && m.type === "standard_moment").map((m, mi) => ({ key: `${grade.grade}.${selectedWeek}.standard.${mi}`, moment: m as StandardMoment}))
        : null;

    const preparationExercisesWeek = grade.weeks[selectedWeek].type === "review_preparation_week";

    const yondanWeek = isYondanWeek(grade.weeks[selectedWeek]) ? grade.weeks[selectedWeek] : null;
    const godanWeek = isGodanWeek(grade.weeks[selectedWeek]) ? grade.weeks[selectedWeek] : null;
    const kyushoZemeWeek = isKyushoZemeWeek(grade.weeks[selectedWeek]) ? grade.weeks[selectedWeek] : null;


    return (
        <>
            <div className="mb-4">
                <Form.Group className="mb-3" controlId="level">
                    <Form.Select onChange={e => setNewGrade(allGradePlans.find(x => x.grade === e.target.value)!)} value={grade.grade}>
                        <option value={myGrade} key={myGrade}>{translator.translate("Min nästa grad")}: {gradeLabel(myGrade, translator)}</option>
                        {
                            allGradePlans.filter(l => l.grade !== myGrade).map(
                                l => <option value={l.grade} key={l.grade}>{gradeLabel(l.grade, translator)}</option>
                            )
                        }
                    </Form.Select>
                </Form.Group>
                <Form.Select
                    value={selectedWeek}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedWeek(parseInt(e.target.value))}
                    name="week-selector"
                >
                    {grade.weeks.map((week, index) => (
                        <option key={index} value={index}>{optionLabel(week)}</option>)
                    )}
                </Form.Select>
            </div>
            {basicExercises && <BasicExerciseCard key={"be"} translator={translator} entries={basicExercises} allGradePlans={allGradePlans} notesData={notesData} ranksData={ranksData} />}
            {hokeiExercises && hokeiExercises.map((he) => <HokeiCard key={he.key} hokei={he.hokei} className="mt-2" notesData={notesData} ranksData={ranksData} />)}
            {otherExercises && otherExercises.map((oe) => <OtherCard key={oe.key} translator={translator} other={oe.moment} />)}
            {preparationExercisesWeek && <PreparationWeekCard translator={translator} />}
            {yondanWeek && <StudyTeachCard key="st" translator={translator} entries={yondanWeek.study_teach} allGradePlans={allGradePlans} notesData={notesData} ranksData={ranksData} />}
            {yondanWeek?.moment && <HokeiCard key="ym" hokei={adaptYondanMoment(yondanWeek.moment)} className="mt-2" notesData={notesData} ranksData={ranksData} />}
            {godanWeek && <HokeiCard key="gm" hokei={adaptGodanMoment(godanWeek.moment)} className="mt-2" notesData={notesData} ranksData={ranksData} />}
            {kyushoZemeWeek && <HokeiCard key="kz" hokei={adaptKyushoZeme(kyushoZemeWeek.zeme)} className="mt-2" notesData={notesData} ranksData={ranksData} />}
        </>
    )
}

interface BasicExerciseCardProps {
    translator: Translator;
    entries: KihonShohoEntry[];
    allGradePlans: GradePlan[];
    notesData: HokeiNotes;
    ranksData: HokeiRanks;
}

function BasicExerciseCard(props: BasicExerciseCardProps) {
    const { entries, translator, allGradePlans, notesData, ranksData } = props;

    const stringEntries = entries.filter((e): e is string => typeof e === "string");
    const hokeiEntries = entries.filter(isHokeiRef);

    const bullets: React.ReactNode[] = [];
    let bulletKey = 0;
    for (const entry of stringEntries) {
        const k = bulletKey++;
        if (translator.isJapanese) {
            bullets.push(<li key={k}>{translator.japanese(entry)}</li>);
        } else {
            bullets.push(<li key={k}>{translator.translate(entry)}</li>);
            bullets.push(<li key={`${k}j`} style={{ listStyle: "none", fontSize: "small" }} className="text-muted">{translator.japanese(entry)}</li>);
        }
    }

    const tanenVideos = tanenMatchesToVideos(
        stringEntries.flatMap(entry => findTanenMatches(entry, tanenKihonHokeiMap))
    );

    const hokeiCards = hokeiEntries.flatMap((entry) => {
        const moment = allGradePlans
            .flatMap(p => p.weeks)
            .flatMap((w): HokeiMoment[] => ("moments" in w) ? w.moments.filter(isHokeiMoment) : [])
            .find(m => m.hokei_name === entry.hokei_ref);
        if (!moment) return [];
        const extended: HokeiMoment = entry.variants.length > 0
            ? { ...moment, variations: [...(moment.variations ?? []), ...entry.variants] }
            : moment;
        return [<HokeiCard key={`hokei-${entry.hokei_ref}`} hokei={extended} className="mt-2" notesData={notesData} ranksData={ranksData} />];
    });

    const hasContent = bullets.length > 0 || hokeiCards.length > 0 || tanenVideos.length > 0;

    return (
        <CollapsibleCard header={cardHead(translator, `Kihon shohō, repetition, studier`)} className="mt-2 app-grid-card hokei-card" showCollapse={hasContent}>
            {bullets.length > 0 && <ul>{bullets}</ul>}
            {tanenVideos.map(v => <VideoLink key={v.url} video={v} className="mt-2" />)}
            {hokeiCards}
        </CollapsibleCard>
    );
}

interface OtherCardProps {
    translator: Translator;
    other: StandardMoment;
}

function OtherCard(props: OtherCardProps) {
    // TODO: Re-implement this
    const { translator, other } = props;

    const renderRandori = () => {
        if (other.content.indexOf("randori") < 0)
            return null;

        if (translator.isJapanese) {
            if (!other.randori && !other.restrictions)
                return <tr><td>{translator.translate("Randori")}</td></tr>;
            else if (other.randori && !other.restrictions)
                return <tr><td>{translator.translate("Randori")}, {translator.translate(other.randori)}</td></tr>;
            else if (!other.randori && other.restrictions)
                return <tr><td>{translator.translate("Randori")}, {translator.translate(other.restrictions)}</td></tr>;
            else if (other.randori && other.restrictions)
                return <tr><td>{translator.translate("Randori")}, {translator.translate(other.randori)}, {translator.translate(other.restrictions)}</td></tr>;
        } else {
             if (!other.randori && !other.restrictions) {
                return <>
                    <tr><td>{translator.translate("Randori")}</td></tr>
                    <tr className="japanese-subtitle text-muted"><td>{translator.japanese("Randori")}</td></tr>
                </>;
            } else if (other.randori && !other.restrictions) {
                return <>
                    <tr><td>{translator.translate("Randori")}, {translator.translate(other.randori)}</td></tr>
                    <tr className="japanese-subtitle text-muted"><td>{translator.japanese("Randori")}, {translator.japanese(other.randori)}</td></tr>
                </>
            } else if (!other.randori && other.restrictions) {
                return <>
                    <tr><td>{translator.translate("Randori")}, {translator.translate(other.restrictions)}</td></tr>
                    <tr className="japanese-subtitle text-muted"><td>{translator.japanese("Randori")}, {translator.japanese(other.restrictions)}</td></tr>
                </>
            }
            else if (other.randori && other.restrictions) {
                return <>
                    <tr><td>{translator.translate("Randori")}, {translator.translate(other.randori)}, {translator.translate(other.restrictions)}</td></tr>
                    <tr className="japanese-subtitle text-muted"><td>{translator.japanese("Randori")}, {translator.japanese(other.randori)}, {translator.japanese(other.restrictions)}</td></tr>
                </>
            }
        }

        return null;
    }

    const renderEmbu = () => {
        if (other.content.indexOf("embu") < 0)
            return null;

        if (translator.isJapanese) {
            return <tr><td>{translator.translate("Embu")}</td></tr>;
        } else {
            return <>
                <tr><td>{translator.translate("Embu")}</td></tr>
                <tr className="japanese-subtitle text-muted"><td>{translator.japanese("Embu")}</td></tr>
            </>;
        }
    }

    const renderExamPreparation = () => {
        if (other.content.indexOf("repetition") < 0)
            return null;

        console.log("In it");
        if (translator.isJapanese) {
            return <tr><td>{translator.translate("Repetition")}</td></tr>;
        } else {
            return <>
                <tr><td>{translator.translate("Repetition")}</td></tr>
                <tr className="japanese-subtitle text-muted"><td>{translator.japanese("Repetition")}</td></tr>
            </>;
        }
    }

    console.log("Hmm", other.content);
    
    return (
        <CollapsibleCard header={cardHead(translator, `Kihon shohō`)} className="mt-2 app-grid-card hokei-card">
            <table className="hokei-individuals-table">
                <tbody>
                    {renderRandori()}
                    {renderEmbu()}
                    {renderExamPreparation()}
                </tbody>
            </table>
        </CollapsibleCard>
    );
}

interface PreparationWeekCardProps {
    translator: Translator;
}

function PreparationWeekCard(props: PreparationWeekCardProps) {
    const { translator } = props;

    const text = "Repetition, studier, förberedelse inför gradering";
    const body = translator.isJapanese 
        ? <tr><td>{translator.japanese(text)}</td></tr>
        : <>
            <tr><td>{translator.translate(text)}</td></tr>
            <tr className="japanese-subtitle text-muted"><td>{translator.japanese(text)}</td></tr>
        </>
    return (
        <CollapsibleCard header={cardHead(translator, `Repetition`)} className="mt-3 app-grid-card hokei-card">
            <table>
                <tbody>
                    {body}
                </tbody>
            </table>            
        </CollapsibleCard>
    );
}

interface StudyTeachCardProps {
    translator: Translator;
    entries: HokeiRef[];
    allGradePlans: GradePlan[];
    notesData: HokeiNotes;
    ranksData: HokeiRanks;
}

function StudyTeachCard(props: StudyTeachCardProps) {
    const { entries, translator, allGradePlans, notesData, ranksData } = props;

    const hokeiCards = entries.flatMap((entry) => {
        const moment = allGradePlans
            .flatMap(p => p.weeks)
            .flatMap((w): HokeiMoment[] => ("moments" in w) ? w.moments.filter(isHokeiMoment) : [])
            .find(m => m.hokei_name === entry.hokei_ref);
        if (!moment) return [];
        const extended: HokeiMoment = entry.variants.length > 0
            ? { ...moment, variations: [...(moment.variations ?? []), ...entry.variants] }
            : moment;
        return [<HokeiCard key={`st-${entry.hokei_ref}`} hokei={extended} className="mt-2" notesData={notesData} ranksData={ranksData} />];
    });

    return (
        <CollapsibleCard header={cardHead(translator, "studera, undervisa")} className="mt-2 app-grid-card hokei-card" showCollapse={hokeiCards.length > 0}>
            {hokeiCards}
        </CollapsibleCard>
    );
}

export default Kamoku;

function findSelectedWeekIndex(grade: GradePlan, anchor: CurrentWeekAnchor | null, todayKey: string): number {
    if (grade.weeks.length === 0) {
        return 0;
    }

    const weekNumber = resolveCurrentWeekNumber(anchor, grade.weeks.length, todayKey);
    const index = grade.weeks.findIndex(week => week.week === weekNumber);
    return index >= 0 ? index : 0;
}
