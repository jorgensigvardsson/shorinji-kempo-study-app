import { Form, Container } from "react-bootstrap";
import { useContext, useState } from "react";
import { TranslatorContext, type Translator } from "./i18n";
import { type GradePlan, type GradeName, type Week, type StandardMoment } from "./data";
import CollapsibleCard from "./CollapsibleCard";
import { cardHead } from "./utilities/CardUtilities";
import HokeiCard from "./components/HokeiCard";
import type { HokeiNotes } from "./persistence/app-data";
import { gradeLabel } from "./strings";

export interface Props {
    myGrade: GradeName;
    allGradePlans: GradePlan[];
    notesData: HokeiNotes;
}

const Kamoku = (props: Props) => {
    const { myGrade, allGradePlans, notesData } = props;
    const [selectedWeek, setSelectedWeek] = useState(0);
    const translator = useContext(TranslatorContext);
    const [grade, setGrade] = useState<GradePlan>(allGradePlans.find(l => l.grade == myGrade)!);

    const setNewGrade = (grade: GradePlan) => {
        setSelectedWeek(0);
        setGrade(grade);
    }

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


    return (
        <Container className="p-3 d-print-none">
            <Form.Group className="mb-3" controlId="level">
                <Form.Label>{translator.translate("Nivå")}</Form.Label>
                <Form.Select onChange={e => setNewGrade(allGradePlans.find(x => x.grade === e.target.value)!)} value={grade.grade}>
                    <option value={myGrade} key={myGrade}>{translator.translate("Min grad")}: {gradeLabel(myGrade, translator)}</option>
                    {
                        allGradePlans.filter(l => l.grade !== myGrade).map(
                            l => <option value={l.grade} key={l.grade}>{gradeLabel(l.grade, translator)}</option>
                        )
                    }
                </Form.Select>
            </Form.Group>
            <Form.Select onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedWeek(parseInt(e.target.value))} name="week-selector">
                {grade.weeks.map((week, index) => (
                    <option key={index} value={index}>{optionLabel(week)}</option>)
                )}
            </Form.Select>
            {basicExercises && <BasicExerciseCard key={"be"} translator={translator} basicExercises={basicExercises} />}
            {hokeiExercises && hokeiExercises.map((he) => <HokeiCard key={he.key} hokei={he.hokei} className="mt-3" notesData={notesData} />)}
            {otherExercises && otherExercises.map((oe) => <OtherCard key={oe.key} translator={translator} other={oe.moment} />)}
            {preparationExercisesWeek && <PreparationWeekCard translator={translator} />}
        </Container>
    )
}

interface BasicExerciseCardProps {
    translator: Translator;
    basicExercises: string[];
}

function BasicExerciseCard(props: BasicExerciseCardProps) {
    const { basicExercises, translator } = props;

    const bullets = [];

    let index = 0;
    for (const be of basicExercises) {
        if (translator.isJapanese) {
            bullets.push(<li key={index++}>{translator.japanese(be)}</li>);
        } else {
            bullets.push(<li key={index++}>{translator.translate(be)}</li>);
            bullets.push(<li key={index++} style={{ listStyle: "none", fontSize: "small" }} className="text-muted">{translator.japanese(be)}</li>);
        }
    }
    
    return (
        <CollapsibleCard header={cardHead(translator, `Kihon shohō, repetition, studier`)} className="mt-3">
            <ul>
                {bullets}
            </ul>
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

    const renderRepetition = () => {
        if (other.content.indexOf("repetition") < 0)
            return null;

        if (translator.isJapanese) {
            return <tr><td>{translator.translate("Repetition")}</td></tr>;
        } else {
            return <>
                <tr><td>{translator.translate("Repetition")}</td></tr>
                <tr className="japanese-subtitle text-muted"><td>{translator.japanese("Repetition")}</td></tr>
            </>;
        }
    }
    
    return (
        <CollapsibleCard header={cardHead(translator, `Kihon shohō`)} className="mt-3">
            <table className="hokei-individuals-table">
                <tbody>
                    {renderRandori()}
                    {renderEmbu()}
                    {renderRepetition()}
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
        <CollapsibleCard header={cardHead(translator, `Repetition`)} className="mt-3">
            <table>
                <tbody>
                    {body}
                </tbody>
            </table>            
        </CollapsibleCard>
    );
}

export default Kamoku;
