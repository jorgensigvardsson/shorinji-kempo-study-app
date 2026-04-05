import type { HokeiExercise, Level } from "./data";
import type { Translator } from "./i18n";

export interface HokeiMatch {
    type: "hokei";
    hokei: HokeiExercise;
}

interface HokeiIndexEntry {
    type: "hokei";
    level: Level;
    hokei: string;
    groupWords: string[];
    groupKanji: string[];
    stanceWords: string[],
    stanceKanji: string[],
    offensiveStanceWords: string[],
    offensiveStanceKanji: string[],
    defensiveStanceWords: string[],
    defensiveStanceKanji: string[],
    kyohan: number[];
}

type IndexEntry = HokeiIndexEntry; // TODO: More types?

export const BuildIndex = (translator: Translator, levels: Level[]): IndexEntry[] => {
    const entries: IndexEntry[] = [];

    for (const level of levels) {
        for (const hokeiExercise of level.trainingProgram.weeks.flatMap(w => w.lessons.filter(l => l.type === "hokei"))) {
            entries.push({
                type: "hokei",
                level: level,
                hokei: translator.translate(hokeiExercise.hokei.name),
                kyohan: hokeiExercise.kyohan ?? [],
                groupWords: wordify(translator, hokeiExercise.hokei.group),
                groupKanji: kanjify(translator, hokeiExercise.hokei.group),
                stanceWords: hokeiExercise.stance.flatMap(s => wordify(translator, s)).flatMap(w => w),
                stanceKanji: hokeiExercise.stance.flatMap(s => kanjify(translator, s)).flatMap(w => w),
                offensiveStanceWords: hokeiExercise.offensiveIndividual ? wordify(translator, hokeiExercise.offensiveIndividual.stance.name) : [],
                offensiveStanceKanji: hokeiExercise.offensiveIndividual ? kanjify(translator, hokeiExercise.offensiveIndividual.stance.name) : [],
                defensiveStanceWords: hokeiExercise.defensiveIndividual ? wordify(translator, hokeiExercise.defensiveIndividual.stance.name) : [],
                defensiveStanceKanji: hokeiExercise.defensiveIndividual ? kanjify(translator, hokeiExercise.defensiveIndividual.stance.name) : []
            });
        }
    }

    return entries;
}

const wordify = (translator: Translator, text: string): string[] => {
    if (translator.isJapanese)
        return [];
    
    return text.split(' ')
               .filter(s => s.length > 0)
               .map(s => s.trim())
               .map(s => {
                    if (s.indexOf('ō') >= 0)
                        return s.replace('ō', 'o');
                    return s;
                });
}

const kanjify = (translator: Translator, text: string): string[] => {
    return translator.japanese(text).split('');
}