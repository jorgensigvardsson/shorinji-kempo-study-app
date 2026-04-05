import { Form, Container } from "react-bootstrap";
import { useContext, useState } from "react";
import { TranslatorContext, type Translator } from "./i18n";
import { humanLevelName, type BasicExercise, type Level, type LevelName, type OtherExercise, type Week } from "./data";
import CollapsibleCard from "./CollapsibleCard";
import { cardHead } from "./utilities/CardUtilities";
import HokeiCard from "./components/HokeiCard";
import { CardSettingsContext } from "./persistence/card-settings";
import type { HokeiNotes } from "./persistence/app-data";
import KamokuPrinting from "./printing/Kamoku";

export interface Props {
    myLevel: LevelName;
    allLevels: Level[];
    notesData: HokeiNotes;
}

const Kamoku = (props: Props) => {
    const { myLevel, allLevels, notesData } = props;
    const [selectedWeek, setSelectedWeek] = useState(0);
    const translator = useContext(TranslatorContext);
    const [level, setLevel] = useState<Level>(allLevels.find(l => l.name == myLevel)!);

    const setNewLevel = (level: Level) => {
        setSelectedWeek(0);
        setLevel(level);
    }

    const optionLabel = (week: Week) => {
        if (!translator.isJapanese)
            return `${translator.translate("Vecka")} ${week.weekNumber} (${translator.japanese("Vecka")} ${translator.japanese(week.weekNumber)})`;
        return `${translator.translate("Vecka")} ${translator.translate(week.weekNumber)}`;
    }

    const levelLabel = (name: LevelName) => {
        let humanName = humanLevelName(name);
        humanName = `${humanName[0].toUpperCase()}${humanName.slice(1)}`;

        if (!translator.isJapanese)
            return `${translator.translate(humanName)} (${translator.japanese(humanName)})`;

        return translator.japanese(humanName);
    }

    const basicExercises = level.trainingProgram.weeks[selectedWeek].lessons.filter(l => l.type === "basic");
    const hokeiExercises = level.trainingProgram.weeks[selectedWeek].lessons.filter(l => l.type === "hokei");
    const otherExercises = level.trainingProgram.weeks[selectedWeek].lessons.filter(l => l.type === "other");

    return (
        <>
            <Container className="p-3 d-print-none">
                <Form.Group className="mb-3" controlId="level">
                    <Form.Label>Nivå</Form.Label>
                    <Form.Select onChange={e => setNewLevel(allLevels.find(x => x.name === e.target.value)!)} value={level.name}>
                        <option value={myLevel} key={myLevel}>Min grad: {levelLabel(myLevel)}</option>
                        {
                            allLevels.filter(l => l.name !== myLevel).map(
                                l => <option value={l.name} key={l.name}>{levelLabel(l.name)}</option>
                            )
                        }
                    </Form.Select>
                </Form.Group>
                <Form.Select onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedWeek(parseInt(e.target.value))} name="week-selector">
                    {level.trainingProgram.weeks.map((week, index) => (
                        <option key={index} value={index}>{optionLabel(week)}</option>)
                    )}
                </Form.Select>
                {basicExercises && <BasicExerciseCard key={"be"} translator={translator} basicExercises={basicExercises} />}
                {hokeiExercises && hokeiExercises.map((he) => <HokeiCard key={he.uniqueId} hokei={he} className="mt-3" notesData={notesData} />)}
                {otherExercises && otherExercises.map((oe) => <OtherCard key={oe.description} translator={translator} other={oe} />)}
            </Container>
            <div className="d-none d-print-block">
                <KamokuPrinting {...props}/>
            </div>
        </>
    )
}

interface BasicExerciseCardProps {
    translator: Translator;
    basicExercises: BasicExercise[];
}

function BasicExerciseCard(props: BasicExerciseCardProps) {
    const { basicExercises, translator } = props;
    const cardSettings = useContext(CardSettingsContext);
    
    return (
        <CollapsibleCard header={cardHead(translator, `Kihon shohō, repetition, studier`, { emSize: cardSettings.cardTextSize })} className="mt-3">
            <ul>
                {basicExercises.map((be, index) => {
                    if (translator.isJapanese)
                        return <li key={index * 2}>{translator.japanese(be.description)}</li>
                    return (
                        <>
                            <li key={index * 2}>{translator.translate(be.description)}</li>
                            <li key={index * 2 + 1} style={{ listStyle: "none", fontSize: "small" }} className="text-muted">{translator.japanese(be.description)}</li>
                        </>
                    );
                })}
            </ul>
        </CollapsibleCard>
    );
}

interface OtherCardProps {
    translator: Translator;
    other: OtherExercise;
}

function OtherCard(props: OtherCardProps) {
    const { translator, other } = props;
    const cardSettings = useContext(CardSettingsContext);
    
    return (
        <CollapsibleCard header={cardHead(translator, `Kihon shohō`, { emSize: cardSettings.cardTextSize })} className="mt-3">
            <table className="hokei-individuals-table">
                <tbody>
                    <tr>
                        <td>{translator.translate(other.description)}</td>
                        {other.restrictions && <td>{translator.translate(other.restrictions)}</td>}
                    </tr>
                    {!translator.isJapanese && <tr className="japanese-subtitle text-muted">
                        <td>{translator.japanese(other.description)}</td>
                        {other.restrictions && <td>{translator.japanese(other.restrictions)}</td>}
                    </tr>}
                </tbody>
            </table>
        </CollapsibleCard>
    );
}

export default Kamoku;