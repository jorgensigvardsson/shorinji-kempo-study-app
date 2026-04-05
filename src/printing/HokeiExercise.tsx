import { useContext, type CSSProperties } from "react";
import type { HokeiExercise as HokeiExerciseType } from "../data";
import { TranslatorContext, type Language } from "../i18n";
import { Label } from "../Labels";
import { Badge } from "react-bootstrap";

interface Props {
    exercise: HokeiExerciseType;
    row: number;
    isStart: boolean;
    numRows: number;
}

const HokeiExercise = (props: Props) => {
    const { exercise, row, isStart, numRows } = props;

    const translator = useContext(TranslatorContext);

    const hokeiStyle: CSSProperties = {
        gridColumn: "3 / span 1",
        gridRow: `${row} / span 1`
    }

    const stanceStyle: CSSProperties = {
        gridColumn: "4 / span 1",
        gridRow: `${row} / span 1`
    } 

    const techniquesStyle: CSSProperties = {
        gridColumn: "5 / span 1",
        gridRow: `${row} / span 1`
    }

    const kyohanStyle: CSSProperties = {
        gridColumn: "6 / span 1",
        gridRow: `${row} / span ${numRows}`
    }

    const stanceSection = (language?: Language) => {
        if (language === undefined)
            language = translator.currentLanguage;

        return (
            <>
                <p>{exercise.stance.map(s => translator.explicitTranslate(language, s)).join(", ")}</p>
                {exercise.offensiveIndividual ? <p>{translator.explicitTranslate(language, "(A)")} {translator.explicitTranslate(language, exercise.offensiveIndividual?.stance.name)}</p> : <p>&nbsp;</p>}
                {exercise.defensiveIndividual ? <p>{translator.explicitTranslate(language, "(F)")} {translator.explicitTranslate(language, exercise.defensiveIndividual?.stance.name)}</p> : <p>&nbsp;</p>}
            </>
        )
    }

    const techniquesSection = (language?: Language) => {
        if (language === undefined)
            language = translator.currentLanguage;

        return (
            <>
                <p>&nbsp;</p>
                {exercise.offensiveIndividual?.technique ? <p>{translator.explicitTranslate(language, exercise.offensiveIndividual?.technique.name)}</p> : <p>&nbsp;</p>}
                {exercise.defensiveIndividual?.technique ? <p>{translator.explicitTranslate(language, exercise.defensiveIndividual?.technique.name)}</p> : <p>&nbsp;</p>}
            </>
        )
    }

    return (
        <>
            <div className="hokei-exercise cell" style={hokeiStyle}>
                <Label text={exercise.hokei.description}/>
                <Badge bg="primary">
                    {translator.translate(exercise.hokei.group)}
                </Badge>
            </div>
            <div style={stanceStyle} className="hokei-stance cell">
                {stanceSection("ja")}
                {!translator.isJapanese &&
                    <><p>&nbsp;</p>
                    {stanceSection()}
                    </>
                }
            </div>
            {<div style={techniquesStyle} className="hokei-techniques cell">
                {techniquesSection("ja")}
                {!translator.isJapanese && <><p>&nbsp;</p>{techniquesSection()}</>}
            </div>}
            {isStart && <div style={kyohanStyle} className="kyohan cell">{
                exercise.kyohan !== undefined
                    ? exercise.kyohan.map(k => <p key={k}>{k}</p>)
                    : <>&nbsp;</>
            }</div>}
        </>
    )
}

export default HokeiExercise;