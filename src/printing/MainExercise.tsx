import type { MainExercise as MainExerciseType } from "../data";
import HokeiExercise from "./HokeiExercise";
import OtherExercise from "./OtherExercise";

interface Props {
    exercise: MainExerciseType;
    row: number;
    isStart: boolean;
    numRows: number;
}

const MainExercise = (props: Props) => {
    const { exercise, row, isStart, numRows } = props;

    switch (exercise.type) {
        case "hokei": return <HokeiExercise exercise={exercise} row={row} isStart={isStart} numRows={numRows}/>
        case "other": return <OtherExercise exercise={exercise} row={row}/>
        default: return <div>TODO: Implement me</div>
    }
}

export default MainExercise;