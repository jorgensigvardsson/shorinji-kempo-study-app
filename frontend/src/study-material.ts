import type { ReadingTopicKey } from "./study-topics";

export interface StudySection {
    key: string;
    title: string;
    termId?: number;
    wordIds?: number[];
    paragraphs?: string[];
    children?: StudySection[];
}

export interface StudyMaterial {
    pages: string;
    sections: StudySection[];
}

// Explicit references to existing, immutable word ids, matched to the headings in
// Yōgoshū (utkast), printed pp. 2–14 and 26–27. Ranges below are ranges of ids,
// never array positions or an inference from the dictionary's display order.
// An entry can be useful in more than one subject; its meaning stays in word-list.
const ids = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, index) => first + index);

export const kihonIntroduction = [
    "Kihon (grunderna) i Shorinji Kempos tekniker är uppdelade i sex grupper.",
    "I tillägg till dessa sex huvudgrupper finns det en sjunde grupp kallad shuhō (守法) – försvarsmetoder, men dessa tränas inte som separata tekniker. All träning fordrar utförande av ovan nämnda sex grupper.",
    "För att lära sig teknikerna måste man lära sig de grundläggande delar som teknikerna består av. Då är det väsentligt att känna till namnen.",
];

export const studyMaterial: Record<ReadingTopicKey, StudyMaterial> = {
    movements: {
        pages: "14, 16–27",
        sections: [
            { key: "common-movements", title: "Vanliga rörelser och övningar", wordIds: ids(319, 361) },
            {
                key: "body-tools", title: "Kroppens delar och redskap", termId: 246,
                children: [
                    {
                        key: "hands", title: "Hand och arm", termId: 791,
                        children: [
                            { key: "fist", title: "Knuten näve", termId: 792, wordIds: [459, 460, ...ids(793, 797)] },
                            { key: "open-hand", title: "Öppen hand", termId: 798, wordIds: ids(799, 806) },
                            { key: "special-hand", title: "Speciella händer", termId: 807, wordIds: [521, ...ids(808, 811)] },
                            { key: "arm", title: "Arm", termId: 812, wordIds: [813, 814, 462, 815, 816] },
                        ],
                    },
                    {
                        key: "legs", title: "Fot och ben", termId: 817,
                        children: [
                            { key: "foot", title: "Fot", termId: 818, wordIds: ids(819, 826) },
                            { key: "leg", title: "Ben", termId: 827, wordIds: ids(828, 830) },
                        ],
                    },
                    {
                        key: "body", title: "Huvud och kropp", termId: 831,
                        children: [
                            { key: "head", title: "Huvud", termId: 832, wordIds: ids(833, 840) },
                            { key: "trunk", title: "Kropp", termId: 841, wordIds: [479, 506, 444, 842] },
                        ],
                    },
                    {
                        key: "objects", title: "Redskap och föremål", termId: 843,
                        children: [
                            { key: "buddhist-objects", title: "Buddhistiska föremål", termId: 247, wordIds: [844, 250, 845, 846, 249, 248, 847] },
                            { key: "other-objects", title: "Andra föremål", termId: 848, wordIds: ids(849, 857) },
                        ],
                    },
                ],
            },
        ],
    },
    language: {
        pages: "2–5, 9–13",
        sections: [
            {
                key: "pronunciation", title: "Uttal och skrivsätt",
                paragraphs: [
                    "Att översätta japanska tecken till fonetisk skrift med västerländska bokstäver kallas för rōmaji.",
                    "I denna ordlista används romaniseringsregler enligt Hepburn-systemet, vilket också är det som är vanligast förekommande inom Shorinji Kempo.",
                    "Ett ord som till exempel 中段 kan skrivas som chudan, chuudan eller chūdan. Vi har valt att använda det sista alternativet och indikera den långa vokalen med ett diaktritiskt streck.",
                    "Det finns fem vokaler: a, i, u, e och o. En lång vokal har samma uttal som den korta, men hålls längre: ā eller aa, ii, ū, ē eller ei, ō.",
                    "I sammansatta ord kan ljud förändras, till exempel keri → geri, shime → jime och tsuki → zuki.",
                ],
            },
            { key: "kana", title: "Hiragana och katakana" },
            { key: "counting", title: "Räkning", wordIds: ids(362, 379) },
            { key: "commands", title: "Träningskommandon", wordIds: ids(139, 181) },
            {
                key: "training-words", title: "Ord i träningen",
                wordIds: [182, 183, ...ids(191, 197), ...ids(203, 211), 214, ...ids(219, 233), ...ids(242, 246), ...ids(253, 273)],
            },
            { key: "directions", title: "Riktningar, grepp och avstånd", wordIds: ids(274, 303) },
        ],
    },
    ranks: {
        pages: "5–6, 10–11",
        sections: [
            { key: "bukai", title: "Teknikgrader", termId: 234, wordIds: [51, ...ids(380, 396)] },
            { key: "hokai", title: "Filosofigrader", termId: 235, wordIds: ids(90, 97) },
            { key: "sokai", title: "Munkgrader", termId: 236, wordIds: ids(79, 89) },
            { key: "roles", title: "Namn, roller och titlar", wordIds: ids(35, 73) },
            { key: "organization", title: "Organisation och medlemskap", wordIds: [...ids(74, 78), ...ids(199, 202), 251, 252] },
        ],
    },
    etiquette: {
        pages: "7, 10–11",
        sections: [
            { key: "greetings", title: "Hälsningar och etikett", wordIds: ids(1, 34) },
            { key: "clothing", title: "Klädsel och utrustning", wordIds: [...ids(184, 190), 229, 230, 262] },
            { key: "routines", title: "Rutiner i dojon", wordIds: [198, ...ids(215, 218), 255, 256, 257] },
        ],
    },
    philosophy: {
        pages: "8–13",
        sections: [
            { key: "sayings", title: "Uttryck och talesätt", wordIds: ids(98, 138) },
            { key: "concepts", title: "Begrepp inom läran", wordIds: [212, 213, ...ids(237, 241), 302, ...ids(304, 313)] },
            { key: "texts", title: "Benämningar på gemensamma texter", wordIds: ids(314, 318) },
        ],
    },
};

export function flattenStudySections(sections: StudySection[]): StudySection[] {
    return sections.flatMap(section => [section, ...flattenStudySections(section.children ?? [])]);
}
