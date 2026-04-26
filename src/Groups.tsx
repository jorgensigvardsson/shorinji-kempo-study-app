import { Badge, Button } from "react-bootstrap";
import { useContext, useMemo, useState } from "react";
import { TranslatorContext } from "./i18n";
import { type HokeiMoment, type GradePlan, type GradeName, getHokeiMoments } from "./data";
import HokeiCard from "./components/HokeiCard";
import type { HokeiNotes, HokeiRanks } from "./persistence/app-data";
import Grid, { type GridItem } from "./components/Grid";
import "./Groups.css";
import { compareGradeThenWeek } from "./utilities/level";

export interface Props {
    allGradePlans: GradePlan[];
    notesData: HokeiNotes;
    ranksData: HokeiRanks;
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
    const { allGradePlans, notesData, ranksData } = props;
    const translator = useContext(TranslatorContext);
    const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);

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
            <div>
                <div className="groups-detail groups-detail-enter">
                    <div className="groups-detail-head mb-3">
                        <div>
                            <h2 className="groups-detail-title mb-1">{selectedGroup.translated}</h2>
                            {!translator.isJapanese && <div className="groups-detail-subtitle">{selectedGroup.japanese}</div>}
                        </div>
                        <div className="d-flex align-items-center gap-2">
                            <Badge className="groups-count-badge">{selectedGroup.hokeis.length}</Badge>
                            <Button variant="outline-secondary" onClick={() => setSelectedGroupKey(null)}>
                                {translator.translate("Stäng")}
                            </Button>
                        </div>
                    </div>
                    <div>
                        {selectedGroup.hokeis.map(h => (
                            <div style={{ fontSize: "smaller" }} key={`${h.grade}.${h.week}.${h.momentIndex}.${h.moment.hokei_name}`}>
                                <HokeiCard hokei={h.moment} gradeName={h.grade} className="m-1"
                                           notesData={notesData} ranksData={ranksData} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const items: GridItem[] = groups.map((group: HokeiGroup) => {
        const previewHokeis = group.hokeis.slice(0, 3).map(h => translator.translate(h.moment.hokei_name));

        return {
            key: group.key,
            title: group.translated,
            badge: <Badge className="groups-count-badge">{group.hokeis.length}</Badge>,
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

    return <Grid items={items} />;
}

export default Groups;
