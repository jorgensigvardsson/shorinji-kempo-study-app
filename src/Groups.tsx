import { Badge, Button, Card, Container } from "react-bootstrap";
import { useContext, useMemo, useState } from "react";
import { TranslatorContext } from "./i18n";
import { type HokeiMoment, type GradePlan, type GradeName, getHokeiMoments } from "./data";
import HokeiCard from "./components/HokeiCard";
import type { HokeiNotes } from "./persistence/app-data";
import { CardSettingsContext } from "./persistence/card-settings";
import "./Groups.css";

export interface Props {
    allGradePlans: GradePlan[];
    notesData: HokeiNotes;
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
    const { allGradePlans, notesData } = props;
    const cardSettings = useContext(CardSettingsContext);
    const translator = useContext(TranslatorContext);
    const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);

    const groups = useMemo(() => {
        const allHokeis = allGradePlans.flatMap(grade => grade.weeks.filter(w => w.type === "regular_week").map(w => ({ grade: grade.grade, week: w.week, moments: getHokeiMoments(w) })))
                                       .flatMap(({ grade, week, moments }) => moments.map((moment, momentIndex) => ({ grade, week, moment, momentIndex })))
                                       .sort((a, b) => a.grade.localeCompare(b.grade));

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
            <Container className="p-3">
                <div className="groups-detail groups-detail-enter">
                    <div className="groups-detail-head mb-3">
                        <div>
                            <h2 className="groups-detail-title mb-1" style={{ fontSize: `${cardSettings.cardTextSize * 1.4}em` }}>{selectedGroup.translated}</h2>
                            {!translator.isJapanese && <div className="groups-detail-subtitle">{selectedGroup.japanese}</div>}
                        </div>
                        <div className="d-flex align-items-center gap-2">
                            <Badge bg="secondary">{selectedGroup.hokeis.length}</Badge>
                            <Button variant="outline-secondary" onClick={() => setSelectedGroupKey(null)}>
                                {translator.translate("Stäng")}
                            </Button>
                        </div>
                    </div>
                    <div>
                        {selectedGroup.hokeis.map(h => (
                            <div style={{ fontSize: "smaller" }} key={`${h.grade}.${h.week}.${h.momentIndex}.${h.moment.hokei_name}`}>
                                <HokeiCard hokei={h.moment} gradeName={h.grade} className="m-1"
                                           notesData={notesData} />
                            </div>
                        ))}
                    </div>
                </div>
            </Container>
        );
    }

    return (
        <Container className="p-3">
            <div className="groups-grid">
                {groups.map((group: HokeiGroup) => {
                    const previewHokeis = group.hokeis.slice(0, 3).map(h => translator.translate(h.moment.hokei_name));

                    return (
                        <Card key={group.key} className="groups-grid-card"
                              onClick={() => setSelectedGroupKey(group.key)}
                              onKeyDown={e => (e.key === "Enter" || e.key === " ") && setSelectedGroupKey(group.key)}
                              role="button" tabIndex={0}>
                            <Card.Body>
                                <div className="groups-grid-card-top">
                                    <h3 className="groups-grid-title mb-1" style={{ fontSize: `${cardSettings.cardTextSize * 1.2}em` }}>{group.translated}</h3>
                                    <Badge bg="secondary">{group.hokeis.length}</Badge>
                                </div>
                                {!translator.isJapanese && <div className="groups-grid-subtitle">{group.japanese}</div>}
                                <div className="groups-grid-preview mt-3">
                                    {previewHokeis.map((hokei, index) => (
                                        <div key={`${group.key}.preview.${index}`} className="groups-grid-preview-item">{hokei}</div>
                                    ))}
                                    {group.hokeis.length > previewHokeis.length && <div className="groups-grid-preview-more">+{group.hokeis.length - previewHokeis.length}</div>}
                                </div>
                            </Card.Body>
                        </Card>
                    );
                })}
            </div>
        </Container>
    );
}

export default Groups;
