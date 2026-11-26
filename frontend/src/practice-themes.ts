import dictionary from "./assets/word-list.json";
import type { WordListEntry } from "./data";
import type { QuizPool } from "./quiz-logic";

// Immutable dictionary ids: each row is [word, wrong answer, wrong answer].
// Review the pair together with the word. In particular, another greeting or
// an overlapping anatomical description must not become an ambiguous answer.
const commandQuestions = [
    [6, 154, 169], [9, 26, 175], [10, 156, 151], [12, 14, 155],
    [14, 150, 31], [22, 26, 174], [26, 22, 159], [31, 157, 147],
    [147, 148, 22], [148, 147, 154], [150, 154, 22], [151, 169, 175],
    [154, 155, 156], [155, 154, 26], [156, 157, 159], [157, 156, 174],
    [159, 156, 169], [169, 151, 14], [174, 175, 150], [175, 174, 148],
] as const;
const bodyQuestions = [
    [459, 821, 842], [460, 801, 833], [799, 800, 821], [800, 799, 842],
    [801, 819, 479], [813, 821, 842], [462, 479, 821], [819, 821, 842],
    [821, 819, 833], [823, 826, 799], [824, 825, 800], [825, 824, 833],
    [826, 823, 842], [833, 834, 821], [834, 833, 479], [835, 834, 842],
    [836, 837, 821], [837, 836, 799], [479, 462, 842], [842, 479, 821],
] as const;
const footworkQuestions = [
    [539, 542, 543], [540, 543, 547], [541, 544, 547],
    [542, 539, 540], [543, 540, 539], [544, 541, 547],
    [545, 546, 547], [546, 545, 544], [547, 545, 546],
] as const;

export const practiceThemes = {
    commands: {
        title: "Träningskommandon och hälsningar",
        description: "Öva vanliga kommandon och hälsningar.",
        questions: commandQuestions,
        wordIds: commandQuestions.map<number>(([id]) => id),
    },
    body: {
        title: "Kroppsdelar och träffytor",
        description: "Öva ord för kroppen och olika träffytor.",
        questions: bodyQuestions,
        wordIds: bodyQuestions.map<number>(([id]) => id),
    },
    footwork: {
        title: "Fotförflyttningar",
        description: "Öva namn och betydelser för fotförflyttningar.",
        questions: footworkQuestions,
        wordIds: footworkQuestions.map<number>(([id]) => id),
    },
};
export type PracticeTheme = keyof typeof practiceThemes;

const words = new Map<number, WordListEntry>(dictionary.map(word => [word.id, word]));
export function practiceWord(id: number): WordListEntry & { romaji: string; meanings: string[] } {
    const word = words.get(id);
    if (!word?.romaji || !word.meanings?.length) throw new Error(`Missing practice word content: ${id}`);
    return word as WordListEntry & { romaji: string; meanings: string[] };
}

export function buildPracticeQuizPool(theme: PracticeTheme): QuizPool {
    const domainOptions = new Map<string, string[]>();
    const candidates = practiceThemes[theme].questions.map(([id, ...wrongIds]) => {
        const word = practiceWord(id);
        const domain = `practice.${theme}.${id}`;
        domainOptions.set(domain, [word.meanings[0], ...wrongIds.map(wrongId => practiceWord(wrongId).meanings[0])]);
        return {
            id: domain,
            question: 'Vad betyder "{0}"?',
            questionArgs: [word.romaji],
            correctAnswer: word.meanings[0],
            domain,
        };
    });
    return { candidates, domainOptions };
}
