import { useCallback, useSyncExternalStore } from "react";
import { getAppDataStore } from "./store";
import type { HokeiRankValue } from "./schema";

/**
 * The personal note saved against one technique, or null when there is none.
 *
 * The subscription covers the whole `notes` record, but the snapshot is a single
 * technique's value. React compares snapshots with `Object.is` and skips the
 * re-render when one is unchanged, so editing the note on one card leaves every
 * other card on screen alone — the per-technique fan-out that used to be
 * hand-rolled with a Map of listeners keyed by technique name.
 */
export function useHokeiNote(hokeiName: string): string | null {
    const subscribe = useCallback(
        (onStoreChange: () => void) => getAppDataStore().subscribe("notes", onStoreChange),
        []
    );

    return useSyncExternalStore(subscribe, () => getAppDataStore().get("notes")[hokeiName] ?? null);
}

/** Saves a technique's note, or removes it when the note is empty. */
export function setHokeiNote(hokeiName: string, note: string | null): void {
    const store = getAppDataStore();
    const existing = store.get("notes");

    if (note) {
        if (existing[hokeiName] === note) return;
        store.set("notes", { ...existing, [hokeiName]: note });
        return;
    }

    if (!(hokeiName in existing)) return;
    const remaining = { ...existing };
    delete remaining[hokeiName];
    store.set("notes", remaining);
}

/** The self-assessment saved against one technique, or null when unrated. */
export function useHokeiRank(hokeiName: string): HokeiRankValue | null {
    const subscribe = useCallback(
        (onStoreChange: () => void) => getAppDataStore().subscribe("hokeiRanks", onStoreChange),
        []
    );

    return useSyncExternalStore(subscribe, () => getAppDataStore().get("hokeiRanks")[hokeiName]?.value ?? null);
}

/**
 * Saves a technique's self-assessment, or clears it when the rank is null.
 * Rewriting the same value is ignored so the entry keeps its original
 * `updatedAt`, which sync conflict resolution reads.
 */
export function setHokeiRank(hokeiName: string, rank: HokeiRankValue | null): void {
    const store = getAppDataStore();
    const existing = store.get("hokeiRanks");

    if (rank === null) {
        if (!(hokeiName in existing)) return;
        const remaining = { ...existing };
        delete remaining[hokeiName];
        store.set("hokeiRanks", remaining);
        return;
    }

    if (existing[hokeiName]?.value === rank) return;
    store.set("hokeiRanks", {
        ...existing,
        [hokeiName]: { value: rank, updatedAt: new Date().toISOString() },
    });
}
