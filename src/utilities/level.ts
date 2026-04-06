import type { GradeName } from "../data";

export const compareLevels = (a: GradeName, b: GradeName): number => {
    const ao = makeLevelOrdinal(a);
    const bo = makeLevelOrdinal(b);

    return ao - bo;
}

const makeLevelOrdinal = (grade: GradeName): number => {
    switch (grade) {
        case "kudan": return 9;
        case "hachidan": return 8;
        case "nanadan": return 7;
        case "rokudan": return 6;
        case "godan": return 5;
        case "yondan": return 4;
        case "sandan": return 3;
        case "nidan": return 2;
        case "shodan": return 1;
        case "1 kyū": return -1;
        case "2 kyū": return -2;
        case "3 kyū": return -3;
        case "4 kyū": return -4;
        case "5 kyū": return -5;
        case "6 kyū": return -6;
        default:
            throw new Error(`Unrecognized level name ${grade}`);
    }
}