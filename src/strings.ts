import { humanGradeName, type GradeName } from "./data";
import type { Translator } from "./i18n";

export const matchesString = (hayStack: string, needle: string) => {
    const needleLength = needle.length;
    if (needleLength === 0)
        return true;
    if (needleLength > hayStack.length)
        return false;

    const lastStart = hayStack.length - needleLength;
    for (let start = 0; start <= lastStart; start++) {
        if (stringsAreEqual(hayStack, start, needle, 0, needleLength))
            return true;
    }

    return false;
}

const stringsAreEqual = (left: string, leftStart: number, right: string, rightStart: number, length: number) => {
    for (let i = 0; i < length; i++) {
        if (normalizeCharacterCode(left.charCodeAt(leftStart + i)) !== normalizeCharacterCode(right.charCodeAt(rightStart + i)))
            return false;
    }

    return true;
}

const normalizeCharacterCode = (charCode: number) => {
    if (charCode === 333) // ō
        return 111; // o
    if (charCode === 363) // ū
        return 117; // u
    if (charCode >= 65 && charCode <= 90) // A-Z
        return charCode + 32;

    return charCode;
}

export const gradeLabel = (grade: GradeName, translator: Translator) => {
    let humanName = humanGradeName(grade);
    humanName = `${humanName[0].toUpperCase()}${humanName.slice(1)}`;

    if (!translator.isJapanese)
        return `${translator.translate(humanName)} (${translator.japanese(humanName)})`;

    return translator.japanese(humanName);
}
