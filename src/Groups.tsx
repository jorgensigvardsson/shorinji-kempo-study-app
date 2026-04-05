import { Card, Container } from "react-bootstrap";
import { useContext } from "react";
import { TranslatorContext } from "./i18n";
import type { HokeiExercise, Level } from "./data";
import HokeiCard from "./components/HokeiCard";
import type { HokeiNotes } from "./persistence/app-data";
import { CardSettingsContext } from "./persistence/card-settings";

export interface Props {
    allLevels: Level[];
    notesData: HokeiNotes;
}

interface HokeiExerciseWithLevel {
    hokeiExercise: HokeiExercise;
    level: Level;
}

const Groups = (props: Props) => {
    const { allLevels, notesData } = props;
    const cardSettings = useContext(CardSettingsContext);
    
    const translator = useContext(TranslatorContext);
        
    const allHokeis = allLevels.flatMap(level => level.trainingProgram.weeks.map(w => ({level: level, week: w})))
                               .flatMap(levelAndWeek => levelAndWeek.week.lessons.map(l => ({level: levelAndWeek.level, lesson: l})))
                               .filter(levelAndLesson => levelAndLesson.lesson.type === "hokei")
                               .map(levelAndLesson => ({ level: levelAndLesson.level, hokeiExercise: levelAndLesson.lesson as HokeiExercise}))
                               .sort((a, b) => a.hokeiExercise.hokei.name.localeCompare(b.hokeiExercise.hokei.name));

    const hokeisByGroup = new Map<string, HokeiExerciseWithLevel[]>();
    for (const hokeiAndLevel of allHokeis) {
        if(!hokeisByGroup.has(hokeiAndLevel.hokeiExercise.hokei.group))
            hokeisByGroup.set(hokeiAndLevel.hokeiExercise.hokei.group, [hokeiAndLevel]);
        else
            hokeisByGroup.get(hokeiAndLevel.hokeiExercise.hokei.group)!.push(hokeiAndLevel);
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
                    {hokeis.map(h => <div style={{fontSize: "smaller"}}>
                        <HokeiCard key={h.hokeiExercise.hokei.name} hokei={h.hokeiExercise} levelName={h.level.name} className="m-1"
                                   notesData={notesData} />
                    </div>)}
                </Card.Body>
            </Card>
        )
    }

    return <Container className="p-3">{els}</Container>;
}

export default Groups;