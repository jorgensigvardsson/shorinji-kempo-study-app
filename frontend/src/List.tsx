import { useContext, useEffect, useMemo, useState } from "react";
import { type HokeiMoment, type GradePlan, getHokeiMoments, type GradeName } from "./data";
import { TranslatorContext } from "./i18n";
import HokeiCard from "./components/HokeiCard";
import { Form } from "react-bootstrap";
import { compareGrades, compareGradeThenWeek } from "./utilities/level";
import { gradeLabel, matchesString } from "./strings";
import { load } from "./persistence/data";
import { isText, useBrowserState } from "./browser-state";
import { FocusChoicePicker } from "./components/TrainingPageControls";

interface Props {
    grade: GradePlan;
    allGradePlans: GradePlan[];
    dojoMode?: boolean;
}

type Selection = "all" | "own" | "up-to-own" | GradeName;

const selectionData = load<string>("hokeiListSelection", "own");

const List = (props: Props) => {
    const { grade, allGradePlans, dojoMode = false } = props;
    const [selection, setSelection] = useState<Selection>((selectionData.data ?? "own") as Selection);
    const [filterText, setFilterText] = useBrowserState("hokei-query", "", isText);
    const [debouncedFilterText, setDebouncedFilterText] = useState(filterText);
    const translator = useContext(TranslatorContext);
    const visibleSelection = selection === "own" ? grade.grade : selection;
    const selectionChoices = [
        { value: "all", label: translator.translate("Alla") },
        { value: "up-to-own", label: translator.translate("Alla till och med egna") },
        ...allGradePlans.map(plan => ({
            value: plan.grade,
            label: gradeLabel(plan.grade, translator, false),
        })),
    ];

    const allHokeis = useMemo(() =>
        allGradePlans.flatMap(gradePlan => gradePlan.weeks.map(week => ({
            week: week.week,
            grade: gradePlan.grade,
            moments: getHokeiMoments(week),
        })))
            .flatMap(({week, grade, moments}) => moments.map((moment, momentIndex) => ({week, grade, moment, momentIndex})))
            .sort(compareGradeThenWeek),
    [allGradePlans]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => setDebouncedFilterText(filterText), 500);
        return () => window.clearTimeout(timeoutId);
    }, [filterText]);

    useEffect(() => {
        return selectionData.registerListener((newSelection) => {
            setSelection(newSelection as Selection);
        });
    }, []);
           
    // Float hokei whose name matches above those that only match on inner
    // content. Array.sort is stable, so the existing grade-then-week order is
    // preserved within each group. With an empty filter every name "matches",
    // so the ordering is left untouched.
    const nameMatches = (h: HokeiAndGrade) => matchesString(h.moment.hokei_name, debouncedFilterText);
    const filteredHokeis = allHokeis.filter(l => matchesSelection(l.grade, grade.grade, selection))
                                    .filter(l => matchesFilterText(l.grade, l.moment, debouncedFilterText))
                                    .sort((a, b) => Number(nameMatches(b)) - Number(nameMatches(a)));

    return (
        <>
            <div className="training-list-controls training-view-controls mb-4 is-single">
                <div className="training-list-filters">
                    <FocusChoicePicker
                      title={translator.translate("Välj vad som visas")}
                      value={visibleSelection}
                      choices={selectionChoices}
                      className="hokei-selection-control"
                      onChange={value => {
                        const newSelection = value as Selection;
                        selectionData.save(newSelection);
                        setSelection(newSelection);
                      }}
                    />
                    <Form.Control
                        type="search"
                        enterKeyHint="search"
                        placeholder={translator.translate("Sök...")}
                        className="mt-3"
                        value={filterText}
                        onChange={e => setFilterText(e.target.value)}
                        onKeyDown={e => {
                            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                            e.preventDefault();
                            setDebouncedFilterText(e.currentTarget.value);
                            e.currentTarget.blur();
                        }}
                    />
                </div>
            </div>
            {renderHokeis(filteredHokeis, dojoMode)}
        </>
    )
}

const matchesSelection = (grade: GradeName, myGrade: GradeName, selection: Selection) => {
    if (selection === "all")
        return true;

    if (selection === "own")
        return grade == myGrade;
    
    if (selection === "up-to-own")
        return compareGrades(grade, myGrade) <= 0;

    return compareGrades(grade, selection) === 0;
}

const matchesFilterText = (grade: GradeName, hokeiExercise: HokeiMoment, filterText: string) => {
    return matchesString(grade, filterText) ||
           hokeiExercise.roles.attacker.stance && matchesString(hokeiExercise.roles.attacker.stance, filterText) ||
           hokeiExercise.roles.attacker.action && matchesString(hokeiExercise.roles.attacker.action, filterText) ||
           hokeiExercise.roles.defender.stance && matchesString(hokeiExercise.roles.defender.stance, filterText) ||
           hokeiExercise.roles.defender.action && matchesString(hokeiExercise.roles.defender.action, filterText) ||
           matchesString(hokeiExercise.technique_group, filterText) ||
           matchesString(hokeiExercise.hokei_name, filterText) ||
           hokeiExercise.variations && hokeiExercise.variations.some(v => matchesString(v, filterText));
}

interface HokeiAndGrade {
    week: number;
    grade: GradeName;
    moment: HokeiMoment;
    momentIndex: number;
}
const renderHokeis = (hokeis: HokeiAndGrade[], dojoMode: boolean) => {
    return hokeis.map(h => (
        <HokeiCard key={`${h.grade}.${h.week}.${h.momentIndex}`} hokei={h.moment} gradeName={h.grade} className="mt-2"
                        showNotes showRating dojoMode={dojoMode} kamokuLayout/>
    ))
}

export default List;
