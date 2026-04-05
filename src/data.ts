export type Variation = "ura" | "omote" | "katate" | "ryōte" | "morote";

export interface Hokei {
    readonly name: string;
    readonly description: string;
    readonly group: string;
    readonly variations?: Variation[];
    readonly renhanko: boolean;
}

export type HokeiStance = "tai gamae" | "hiraki gamae"; // MorE?

export interface HokeiIndividual {
    readonly technique?: Technique;
    readonly stance: Stance;
}

export interface Stance {
    readonly name: string;
}


export interface Technique {
    readonly name: string;
}

export type MainExercise = HokeiExercise | OtherExercise;
export type Lesson = MainExercise | BasicExercise;

export type HokeiExercise = {
    type: "hokei";
    readonly uniqueId: string;
    readonly hokei: Hokei;
    readonly offensiveIndividual?: HokeiIndividual;
    readonly defensiveIndividual?: HokeiIndividual;
    readonly stance: HokeiStance[];
    readonly kyohan?: number[];
}

export type BasicExercise = {
    type: "basic",
    readonly description: string;
}

export type OtherExercise = {
    type: "other",
    readonly description: string;
    readonly restrictions?: string;
}

export interface Week {
    readonly weekNumber: number;
    readonly lessons: Lesson[];
}

export interface TrainingProgram {
    readonly weeks: Week[];
}

export type LevelName = "Kyu6" | "Kyu5" | "Kyu4" | "Kyu3" | "Kyu2" | "Kyu1" | "Dan1" | "Dan2" | "Dan3" | "Dan4" | "Dan5";

export interface Level {
    readonly name: LevelName; // "1st Kyu", "1st Dan"
    readonly trainingProgram: TrainingProgram;
}

export const humanLevelName = (ln: LevelName) => {
    switch(ln) {
        case "Dan1": return "shodan";
        case "Dan2": return "nidan";
        case "Dan3": return "sandan";
        case "Dan4": return "yondan";
        case "Dan5": return "godan";
        case "Kyu6": return "6 kyū";
        case "Kyu5": return "5 kyū";
        case "Kyu4": return "4 kyū";
        case "Kyu3": return "3 kyū";
        case "Kyu2": return "2 kyū";
        case "Kyu1": return "1 kyū";
    }
}

export interface WordListEntry {
    index: number;
    kanji?: string;
    romaji?: string;
    meanings?: string[];
}
