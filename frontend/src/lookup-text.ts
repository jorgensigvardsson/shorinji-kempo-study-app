// The parts of a word lookup that only need the text the user selected. They live
// apart from word-lookup.ts because that module carries the whole word list, and
// these two run on every mouseup and keyup to decide whether a selection is worth
// offering a lookup for at all — long before any lookup happens.

export const cleanLookupTerm = (value: string): string => value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s.,:;!?()[\]{}"“”'‘’]+|[\s.,:;!?()[\]{}"“”'‘’]+$/g, "");

export const isUsefulLookupSelection = (value: string): boolean => {
    const cleaned = cleanLookupTerm(value);
    if (!cleaned || cleaned.length > 80) return false;
    return cleaned.split(/\s+/).length <= 8;
};
