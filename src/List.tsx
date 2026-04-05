import { useContext, useEffect, useState } from "react";
import { type HokeiExercise, type Level } from "./data";
import { TranslatorContext } from "./i18n";
import type { HokeiNotes } from "./persistence/app-data";
import HokeiCard from "./components/HokeiCard";
import { Container, Form } from "react-bootstrap";
import { compareLevels } from "./utilities/level";

interface Props {
    level: Level;
    allLevels: Level[];
    notesData: HokeiNotes;
}

type Selection = "all" | "own" | "up-to-own";

const List = (props: Props) => {
    const { level, allLevels, notesData } = props;
    const [selection, setSelection] = useState<Selection>("own");
    const [filterText, setFilterText] = useState<string>("");
    const [allHokeis, setAllHokeis] = useState<HokeiAndLevel[]>([]);

    const translator = useContext(TranslatorContext);

    useEffect(() => {
        setAllHokeis(
            allLevels.flatMap(level => level.trainingProgram.weeks.map(w => ({level: level, week: w})))
                     .flatMap(levelAndWeek => levelAndWeek.week.lessons.map(l => ({level: levelAndWeek.level, lesson: l})))
                     .filter(levelAndLesson => levelAndLesson.lesson.type === "hokei")
                     .map(levelAndLesson => ({ level: levelAndLesson.level, hokeiExercise: levelAndLesson.lesson as HokeiExercise}))
                     .sort((a, b) => a.hokeiExercise.hokei.name.localeCompare(b.hokeiExercise.hokei.name))
        )
    }, [allLevels]);
           
    const filteredHokeis = allHokeis.filter(l => matchesSelection(l.level, level, selection))
                                    .filter(l => matchesFilterText(l.hokeiExercise, filterText));

    return (
        <Container className="p-3">
            <Form className="mb-3">
                <Form.Select size="sm" value={selection} onChange={e => setSelection(e.target.value as Selection)}>
                    <option value="all">{translator.translate('Alla')}</option>
                    <option value="own">{translator.translate('Endast egna')}</option>
                    <option value="up-to-own">{translator.translate('Alla till och med egna')}</option>
                </Form.Select>
                {/* TODO: don't filter directly, add some kind of wait state before running the query */}
                <Form.Control placeholder={translator.translate("Filtrera...")} className="mt-2"
                              value={filterText} onChange={e => setFilterText(e.target.value)} />
            </Form>
            {renderHokeis(filteredHokeis, notesData)}
        </Container>
    )
}

const matchesSelection = (level: Level, myLevel: Level, selection: Selection) => {
    if (selection === "all")
        return true;

    if (selection === "own")
        return level.name == myLevel.name;
    
    return compareLevels(level, myLevel) <= 0;
}

const matchesFilterText = (hokeiExercise: HokeiExercise, filterText: string) => {
    return matchesString(hokeiExercise.hokei.name, filterText) ||
           hokeiExercise.stance.some(s => matchesString(s, filterText)) ||
           hokeiExercise.offensiveIndividual && (
              matchesString(hokeiExercise.offensiveIndividual.stance.name, filterText) ||
              hokeiExercise.offensiveIndividual.technique && matchesString(hokeiExercise.offensiveIndividual.technique.name, filterText)
           ) ||
           hokeiExercise.defensiveIndividual && (
              matchesString(hokeiExercise.defensiveIndividual.stance.name, filterText) ||
              hokeiExercise.defensiveIndividual.technique && matchesString(hokeiExercise.defensiveIndividual.technique.name, filterText)
           ) ||
           matchesString(hokeiExercise.hokei.description, filterText) ||
           matchesString(hokeiExercise.hokei.group, filterText) ||
           hokeiExercise.hokei.variations && hokeiExercise.hokei.variations.some(v => matchesString(v, filterText));
}

const matchesString = (hayStack: string, needle: string) => {
    if (hayStack.indexOf('ō') >= 0)
        hayStack = hayStack.replaceAll("ō", "o");
    if (hayStack.indexOf('ū'))
        hayStack = hayStack.replaceAll('ū', 'u');

    return hayStack.toLowerCase().includes(needle.toLowerCase());
}

interface HokeiAndLevel {
    level: Level;
    hokeiExercise: HokeiExercise
}
const renderHokeis = (hokeis: HokeiAndLevel[], notesData: HokeiNotes) => {
    return hokeis.map(h => (
        <HokeiCard key={h.hokeiExercise.uniqueId} hokei={h.hokeiExercise} levelName={h.level.name} className="mt-3"
                        notesData={notesData}/>
    ))
}

export default List;