import { useContext, useEffect, useState } from "react";
import { type HokeiMoment, type GradePlan, getHokeiMoments, type GradeName } from "./data";
import { TranslatorContext } from "./i18n";
import type { HokeiNotes } from "./persistence/app-data";
import HokeiCard from "./components/HokeiCard";
import { Container, Form } from "react-bootstrap";
import { compareLevels } from "./utilities/level";
import { gradeLabel, matchesString } from "./strings";

interface Props {
    grade: GradePlan;
    allGradePlans: GradePlan[];
    notesData: HokeiNotes;
}

type Selection = "all" | "own" | "up-to-own" | GradeName;

const List = (props: Props) => {
    const { grade, allGradePlans, notesData } = props;
    const [selection, setSelection] = useState<Selection>("own");
    const [filterText, setFilterText] = useState<string>("");
    const [debouncedFilterText, setDebouncedFilterText] = useState<string>("");
    const [allHokeis, setAllHokeis] = useState<HokeiAndGrade[]>([]);

    const translator = useContext(TranslatorContext);

    useEffect(() => {
        setAllHokeis(
            allGradePlans.flatMap(grade => grade.weeks.filter(w => w.type === "regular_week").map(w => ({week: w.week, grade: grade.grade, moments: getHokeiMoments(w)})))
                         .flatMap(({week, grade, moments}) => moments.map((moment, momentIndex) => ({ week, grade, moment, momentIndex})))
                         .sort((a, b) => a.grade.localeCompare(b.grade))
        )
    }, [allGradePlans]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => setDebouncedFilterText(filterText), 500);
        return () => window.clearTimeout(timeoutId);
    }, [filterText]);
           
    const filteredHokeis = allHokeis.filter(l => matchesSelection(l.grade, grade.grade, selection))
                                    .filter(l => matchesFilterText(l.grade, l.moment, debouncedFilterText));

    return (
        <Container className="p-3">
            <Form className="mb-3">
                <Form.Select size="sm" value={selection} onChange={e => setSelection(e.target.value as Selection)}>
                    <option value="all">{translator.translate('Alla')}</option>
                    <option value="own">{translator.translate('Endast egna')}</option>
                    <option value="up-to-own">{translator.translate('Alla till och med egna')}</option>
                    <option value="6 kyū">{gradeLabel('6 kyū', translator)}</option>
                    <option value="5 kyū">{gradeLabel('5 kyū', translator)}</option>
                    <option value="4 kyū">{gradeLabel('4 kyū', translator)}</option>
                    <option value="3 kyū">{gradeLabel('3 kyū', translator)}</option>
                    <option value="2 kyū">{gradeLabel('2 kyū', translator)}</option>
                    <option value="1 kyū">{gradeLabel('1 kyū', translator)}</option>
                    <option value="shodan">{gradeLabel('shodan', translator)}</option>
                    <option value="nidan">{gradeLabel('nidan', translator)}</option>
                    <option value="sandan">{gradeLabel('sandan', translator)}</option>
                </Form.Select>
                <Form.Control placeholder={translator.translate("Filtrera...")} className="mt-2"
                              value={filterText} onChange={e => setFilterText(e.target.value)} />
            </Form>
            {renderHokeis(filteredHokeis, notesData)}
        </Container>
    )
}

const matchesSelection = (grade: GradeName, myGrade: GradeName, selection: Selection) => {
    if (selection === "all")
        return true;

    if (selection === "own")
        return grade == myGrade;
    
    if (selection === "up-to-own")
        return compareLevels(grade, myGrade) <= 0;

    return compareLevels(grade, selection) === 0;
}

const matchesFilterText = (grade: GradeName, hokeiExercise: HokeiMoment, filterText: string) => {
    return matchesString(grade, filterText) ||
           hokeiExercise.roles.attacker.stance && matchesString(hokeiExercise.roles.attacker.stance, filterText) ||
           hokeiExercise.roles.attacker.action && matchesString(hokeiExercise.roles.attacker.action, filterText) ||
           hokeiExercise.roles.defender.stance && matchesString(hokeiExercise.roles.defender.stance, filterText) ||
           hokeiExercise.roles.defender.action && matchesString(hokeiExercise.roles.defender.action, filterText) ||
           matchesString(hokeiExercise.technique_group, filterText) ||
           hokeiExercise.variations && hokeiExercise.variations.some(v => matchesString(v, filterText));
}

interface HokeiAndGrade {
    week: number;
    grade: GradeName;
    moment: HokeiMoment;
    momentIndex: number;
}
const renderHokeis = (hokeis: HokeiAndGrade[], notesData: HokeiNotes) => {
    return hokeis.map(h => (
        <HokeiCard key={`${h.grade}.${h.week}.${h.momentIndex}`} hokei={h.moment} gradeName={h.grade} className="mt-3"
                        notesData={notesData}/>
    ))
}

export default List;
