import type { Level } from "../data";

export const compareLevels = (a: Level, b: Level): number => {
    const ac = /^(Dan|Kyu)(\d)$/.exec(a.name);
    const bc = /^(Dan|Kyu)(\d)$/.exec(b.name);

    if (!ac)
        throw new Error("a is not a valid level.");

    if (!bc)
        throw new Error("b is not a valid level.");

    const aOrdinal = makeLevelOrdinal(ac[1], parseInt(ac[2]));
    const bOrdinal = makeLevelOrdinal(ac[1], parseInt(ac[2]));

    return aOrdinal - bOrdinal;
}

const kyuLevels = 6;

const makeLevelOrdinal = (group: string, groupOrdinal: number): number => {
    let ordinal = 0;
    if (group === "Kyu") {
        ordinal = kyuLevels - groupOrdinal; // Because kyu levels are enumerated in descending order
    } else {
        // Must be dan
        ordinal = kyuLevels + groupOrdinal - 1; // Because Shodan starts with 1, and we're 0-indexed
    }
    return ordinal;
}