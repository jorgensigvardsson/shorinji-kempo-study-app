import { cleanLookupTerm } from "./lookup-text";
import { normalizeString } from "./strings";

export interface MissingWordLookup {
    term: string;
    count: number;
    lastSearchedAt: string;
}

const storageKey = "missing-word-lookups";
export const missingWordLookupsChanged = "missing-word-lookups-changed";

export const getMissingWordLookups = (): MissingWordLookup[] => {
    try {
        const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown;
        if (!Array.isArray(stored)) return [];
        return stored.filter((entry): entry is MissingWordLookup => {
            if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
            const candidate = entry as Record<string, unknown>;
            return typeof candidate.term === "string"
                && typeof candidate.count === "number"
                && Number.isFinite(candidate.count)
                && typeof candidate.lastSearchedAt === "string";
        }).sort((left, right) => right.count - left.count || left.term.localeCompare(right.term));
    } catch {
        return [];
    }
};

export const logMissingWordLookup = (value: string): void => {
    const term = cleanLookupTerm(value);
    if (!term) return;
    const key = normalizeString(term);
    const entries = getMissingWordLookups();
    const existing = entries.find(entry => normalizeString(entry.term) === key);
    if (existing) {
        existing.count += 1;
        existing.lastSearchedAt = new Date().toISOString();
    } else {
        entries.push({ term, count: 1, lastSearchedAt: new Date().toISOString() });
    }

    try {
        localStorage.setItem(storageKey, JSON.stringify(entries.slice(0, 200)));
        window.dispatchEvent(new CustomEvent(missingWordLookupsChanged));
    } catch {
        // The lookup still works when storage is unavailable; only the local log is skipped.
    }
};
