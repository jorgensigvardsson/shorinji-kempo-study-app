import type { BasicExercise as BasicExerciseType } from "../data";
import { Label } from "../Labels";

interface Props {
    exercise: BasicExerciseType
}

const BasicExercise = (props: Props) => {
    const { exercise } = props;

    return (
        <div className="basic-exercise"><Label text={exercise.description}/></div>
    )
}

export default BasicExercise;