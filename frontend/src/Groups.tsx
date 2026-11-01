import { useContext, useMemo } from "react";
import { TranslatorContext } from "./i18n";
import { type HokeiMoment, type GradePlan, type GradeName, getHokeiMoments } from "./data";
import HokeiCard from "./components/HokeiCard";
import Grid, { type GridItem } from "./components/Grid";
import "./Groups.css";
import { compareGradeThenWeek } from "./utilities/level";
import { useBrowserState } from "./browser-state";

export interface Props {
    allGradePlans: GradePlan[];
}

interface HokeiMomentWithGrade {
    moment: HokeiMoment;
    momentIndex: number;
    grade: GradeName;
    week: number;
}

interface HokeiGroup {
    key: string;
    translated: string;
    japanese: string;
    hokeis: HokeiMomentWithGrade[];
}

const Groups = (props: Props) => {
    const { allGradePlans } = props;
    const translator = useContext(TranslatorContext);
    const [selectedGroupKey, setSelectedGroupKey] = useBrowserState<string | null>("technique-group", null, (value): value is string | null => value === null || typeof value === "string");

    const groups = useMemo(() => {
        const allHokeis = allGradePlans.flatMap(grade => grade.weeks.filter(w => w.type === "regular_week").map(w => ({ grade: grade.grade, week: w.week, moments: getHokeiMoments(w) })))
                                       .flatMap(({ grade, week, moments }) => moments.map((moment, momentIndex) => ({ grade, week, moment, momentIndex })))
                                       .sort(compareGradeThenWeek);

        const hokeisByGroup = new Map<string, HokeiMomentWithGrade[]>();
        for (const hokeiAndGrade of allHokeis) {
            if (!hokeisByGroup.has(hokeiAndGrade.moment.technique_group))
                hokeisByGroup.set(hokeiAndGrade.moment.technique_group, [hokeiAndGrade]);
            else
                hokeisByGroup.get(hokeiAndGrade.moment.technique_group)!.push(hokeiAndGrade);
        }

        const sortedGroupKeys = [...hokeisByGroup.keys()].sort((a, b) => a.localeCompare(b));
        return sortedGroupKeys.map(key => ({
            key,
            translated: translator.translate(key),
            japanese: translator.japanese(key),
            hokeis: hokeisByGroup.get(key)!
        }));
    }, [allGradePlans, translator]);

    const selectedGroup = selectedGroupKey ? groups.find(g => g.key === selectedGroupKey) ?? null : null;

    if (selectedGroup) {
        return (
            <div className="groups-detail">
                <button type="button" className="groups-back" onClick={() => setSelectedGroupKey(null)}>
                    <span>{translator.translate("Teknikgrupper")}</span>
                </button>
                <div className="groups-detail-head">
                    <div>
                        <h2 className="app-view-heading groups-detail-title">{selectedGroup.translated}</h2>
                        {!translator.isJapanese && <div className="groups-detail-subtitle">{selectedGroup.japanese}</div>}
                    </div>
                    <span className="groups-count">{selectedGroup.hokeis.length}</span>
                </div>
                <div>
                    {selectedGroup.hokeis.map(h => (
                        <div key={`${h.grade}.${h.week}.${h.momentIndex}.${h.moment.hokei_name}`} className="mb-3">
                            <HokeiCard hokei={h.moment} gradeName={h.grade} className="m-1"
                                        showNotes showRating />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const items: GridItem[] = groups.map((group: HokeiGroup) => {
        const previewHokeis = group.hokeis.slice(0, 3).map(h => translator.translate(h.moment.hokei_name));

        return {
            key: group.key,
            title: group.translated,
            badge: <span className="groups-count">{group.hokeis.length}</span>,
            subtitle: !translator.isJapanese ? group.japanese : undefined,
            preview: (
                <>
                    {previewHokeis.map((hokei, index) => (
                        <div key={`${group.key}.preview.${index}`} className="app-grid-preview-item">{hokei}</div>
                    ))}
                    {group.hokeis.length > previewHokeis.length && <div className="app-grid-preview-more">+{group.hokeis.length - previewHokeis.length}</div>}
                </>
            ),
            onSelect: () => setSelectedGroupKey(group.key),
        };
    });

    return <Grid items={items} className="groups-grid"/>;
}

export default Groups;
