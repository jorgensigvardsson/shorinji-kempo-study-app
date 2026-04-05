import type { CSSProperties, JSX } from "react";
import BasicExercise from "./BasicExercise";
import type { Week as WeekType } from "../data";
import MainExercise from "./MainExercise";

interface Props {
    startRow: number;
    weekNumber: number;
    week: WeekType
}

const Week = (props: Props) => {
    const { startRow, week, weekNumber } = props;

    const basicExercises = week.lessons.filter(l => l.type === "basic");
    const mainExecises = week.lessons.filter(l => l.type !== "basic");

    const weekNumberStyle: CSSProperties = {
        gridColumn: "1 / span 1",
        gridRow: `${startRow} / span ${mainExecises.length}`
    }

    const basicExercisesStyle: CSSProperties = {
        gridColumn: "2 / span 1",
        gridRow: `${startRow} / span ${mainExecises.length}`
    }

    const basicExercisesElements: JSX.Element[] = 
        basicExercises.map((be, index) => <BasicExercise exercise={be} key={`${be.type}.${index}`}/>)

    const mainExerciseElements: JSX.Element[] =
        mainExecises.map((me, index) => <MainExercise exercise={me} isStart={index == 0} numRows={mainExecises.length} row={startRow + index} key={`${me.type}.${index}`}/>);

    return (
        <>
            <div className="header cell" style={weekNumberStyle}>{weekNumber}</div>
            <div className="basic-exercises cell" style={basicExercisesStyle}>{basicExercisesElements}</div>
            {mainExerciseElements}
        </>
    )
}

export default Week;