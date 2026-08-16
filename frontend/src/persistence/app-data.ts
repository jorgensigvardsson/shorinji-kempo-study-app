import { useCallback, useSyncExternalStore } from "react";
import { getAppDataStore } from "./store";
import { HOKEI_NOTE_MAX_LENGTH, type HokeiRankValue } from "./schema";

/**
 * The personal note saved against one technique, or null when there is none.
 *
 * The subscription covers the whole `notes` record, but the snapshot is a single
 * technique's value. React compares snapshots with `Object.is` and skips the
 * re-render when one is unchanged, so editing the note on one card leaves every
 * other card on screen alone — the per-technique fan-out that used to be
 * hand-rolled with a Map of listeners keyed by technique name.
 */
export function useHokeiNote(hokeiId: string): string | null {
    const subscribe = useCallback(
        (onStoreChange: () => void) => getAppDataStore().subscribe("notes", onStoreChange),
        []
    );

    return useSyncExternalStore(subscribe, () => getAppDataStore().get("notes")[hokeiId] ?? null);
}

/**
 * Saves a technique's note, or removes it when the note is empty.
 *
 * The note is cut to HOKEI_NOTE_MAX_LENGTH here as well as in the editor, because the
 * editor's limit only covers typing: a paste, an autofill, or a note arriving from a
 * build that had no limit all reach the document without passing through it.
 */
export function setHokeiNote(hokeiId: string, note: string | null): void {
    const store = getAppDataStore();
    const existing = store.get("notes");

    if (note) {
        const capped = note.length > HOKEI_NOTE_MAX_LENGTH ? note.slice(0, HOKEI_NOTE_MAX_LENGTH) : note;
        if (existing[hokeiId] === capped) return;
        store.set("notes", { ...existing, [hokeiId]: capped });
        return;
    }

    if (!(hokeiId in existing)) return;
    const remaining = { ...existing };
    delete remaining[hokeiId];
    store.set("notes", remaining);
}

/** The self-assessment saved against one technique, or null when unrated. */
export function useHokeiRank(hokeiId: string): HokeiRankValue | null {
    const subscribe = useCallback(
        (onStoreChange: () => void) => getAppDataStore().subscribe("hokeiRanks", onStoreChange),
        []
    );

    return useSyncExternalStore(subscribe, () => getAppDataStore().get("hokeiRanks")[hokeiId]?.value ?? null);
}

/**
 * Saves a technique's self-assessment, or clears it when the rank is null.
 * Rewriting the same value is ignored so the entry keeps its original
 * `updatedAt`, which sync conflict resolution reads.
 */
export function setHokeiRank(hokeiId: string, rank: HokeiRankValue | null): void {
    const store = getAppDataStore();
    const existing = store.get("hokeiRanks");

    if (rank === null) {
        if (!(hokeiId in existing)) return;
        const remaining = { ...existing };
        delete remaining[hokeiId];
        store.set("hokeiRanks", remaining);
        return;
    }

    if (existing[hokeiId]?.value === rank) return;
    store.set("hokeiRanks", {
        ...existing,
        [hokeiId]: { value: rank, updatedAt: new Date().toISOString() },
    });
}

type GradingCompletionField = "gradingFundamentalCompletions" | "gradingTheoryCompletions";

function setGradingCompletion(field: GradingCompletionField, key: string, completed: boolean): void {
    const store = getAppDataStore();
    const existing = store.get(field);

    if (completed) {
        if (existing[key]) return;
        store.set(field, {
            ...existing,
            [key]: { completedAt: new Date().toISOString() },
        });
        return;
    }

    if (!(key in existing)) return;
    const remaining = { ...existing };
    delete remaining[key];
    store.set(field, remaining);
}

/** Marks one fundamentals requirement as completed, or removes its mark. */
export function setGradingFundamentalCompletion(key: string, completed: boolean): void {
    setGradingCompletion("gradingFundamentalCompletions", key, completed);
}

/** Marks one large theory area as completed, or removes its mark. */
export function setGradingTheoryCompletion(key: string, completed: boolean): void {
    setGradingCompletion("gradingTheoryCompletions", key, completed);
}
