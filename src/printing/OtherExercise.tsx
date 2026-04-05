import type { CSSProperties } from "react";
import type { OtherExercise as OtherExerciseType } from "../data";
import { Label } from "../Labels";

interface Props {
    exercise: OtherExerciseType;
    row: number;
}

const OtherExercise = (props: Props) => {
    const { exercise, row } = props;

    const otherStyle: CSSProperties = {
        gridColumn: "3 / span 1",
        gridRow: `${row} / span 1`
    }

    const otherStyleExtra: CSSProperties = {
        gridColumn: "4 / span 2",
        gridRow: `${row} / span 1`
    }

    return (
        <>
            <div className="other-exercise cell" style={otherStyle}><Label text={exercise.description}/></div>
            <div className="other-exercise-extra cell" style={otherStyleExtra}>{exercise.restrictions && <Label text={exercise.restrictions}/>}</div>
        </>
    )
}

export default OtherExercise;