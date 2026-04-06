import { Card, Container } from "react-bootstrap";
import { useContext } from "react";
import { TranslatorContext } from "./i18n";
import { type HokeiMoment, type GradePlan, type GradeName, getHokeiMoments } from "./data";
import HokeiCard from "./components/HokeiCard";
import type { HokeiNotes } from "./persistence/app-data";
import { CardSettingsContext } from "./persistence/card-settings";

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

const Groups = (props: Props) => {
    const { allGradePlans, notesData } = props;
    const cardSettings = useContext(CardSettingsContext);
    
    const translator = useContext(TranslatorContext);
        
    const allHokeis = allGradePlans.flatMap(grade => grade.weeks.filter(w => w.type === "regular_week").map(w => ({grade: grade.grade, week: w.week, moments: getHokeiMoments(w)})))
                                   .flatMap(({grade, week, moments}) => moments.map((moment, momentIndex) => ({ grade, week, moment, momentIndex })))
                                   .sort((a, b) => a.grade.localeCompare(b.grade));

    const hokeisByGroup = new Map<string, HokeiMomentWithGrade[]>();
    for (const hokeiAndGrade of allHokeis) {
        if(!hokeisByGroup.has(hokeiAndGrade.moment.technique_group))
            hokeisByGroup.set(hokeiAndGrade.moment.technique_group, [hokeiAndGrade]);
        else
            hokeisByGroup.get(hokeiAndGrade.moment.technique_group)!.push(hokeiAndGrade);
    }

    const sortedGroups = [...hokeisByGroup.keys()].sort((a, b) => a.localeCompare(b));

    const els = [];
    for (const group of sortedGroups) {
        const hokeis = hokeisByGroup.get(group)!;
        const translatedGroup = translator.translate(group);
        const japaneseGroup = translator.japanese(group);

        els.push(
            <Card key={group} className="mb-3">
                <Card.Header>
                    <div style={{fontSize: `${cardSettings.cardTextSize * 1.2}em`}}>{translatedGroup}</div>
                    {!translator.isJapanese && <div style={{fontSize: `${cardSettings.cardTextSize * 1}em`}}>{japaneseGroup}</div>}
                </Card.Header>
                <Card.Body className="p-0">
                    {hokeis.map(h => <div style={{fontSize: "smaller"}} key={`${h.grade}.${h.week}.${h.momentIndex}.${h.moment.hokei_name}`}>
                        <HokeiCard hokei={h.moment} gradeName={h.grade} className="m-1"
                                   notesData={notesData} />
                    </div>)}
                </Card.Body>
            </Card>
        )
    }

    return <Container className="p-3">{els}</Container>;
}

export default Groups;