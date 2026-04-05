import { type CSSProperties, type JSX } from "react";
import Week from "./Week";
import { Label } from "../Labels";
import type { Props } from "../Kamoku";

const Kamoku = (props: Props) => {
    const { myLevel, allLevels } = props;

    const level = allLevels.find(l => l.name === myLevel);
    if (!level)
        return null;

    let mainExerciseCount = 0;
    for (const week of level.trainingProgram.weeks) {
        for (const lesson of week.lessons) {
            if (lesson.type !== "basic")
                mainExerciseCount++;
        }
    }

    const style: CSSProperties = {
        display: "grid",
        gridTemplateColumns: "50px 2fr 1fr 1fr 2fr 50px",
        gridTemplateRows: `50px ${"1fr ".repeat(mainExerciseCount)}`
    };

    const weeks: JSX.Element[] = [];
    let startRow = 2;
    let weekNumber = 1;
    for (const week of level.trainingProgram.weeks) {
        weeks.push(<Week week={week} startRow={startRow} key={startRow} weekNumber={weekNumber}/>);
        startRow += week.lessons.reduce((prev, curr) => prev + (curr.type === "basic" ? 0 : 1), 0);
        weekNumber++;
    }

    return (
        <div className="kamoku" style={style}>
            <div className="header cell" style={{gridColumn: "1 / span 1", gridRow: "1 / span 1"}}><Label text="Vecka"/></div>
            <div className="header cell" style={{gridColumn: "2 / span 1", gridRow: "1 / span 1"}}><Label text="Kihon shohō, repetition, studier"/></div>
            <div className="header cell" style={{gridColumn: "3 / span 1", gridRow: "1 / span 1"}}><Label text="Kihon hōkei"/></div>
            <div className="header cell" style={{gridColumn: "4 / span 1", gridRow: "1 / span 1"}}><Label text="Fujin, tai gamae"/></div>
            <div className="header cell" style={{gridColumn: "5 / span 1", gridRow: "1 / span 1"}}><Label text="Kōgeki, bōgi, katame, atemi"/></div>
            <div className="header cell" style={{gridColumn: "6 / span 1", gridRow: "1 / span 1"}}><Label text="Kyōhan"/></div>
            {weeks}
        </div>
    )
}

export default Kamoku;