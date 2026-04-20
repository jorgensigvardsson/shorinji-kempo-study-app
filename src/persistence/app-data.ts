import { getAppDataStore } from "./store";
import type { HokeiRankValue } from "./schema";

type NoteUpdatedCallback = (notes: string | null) => void;
type UnregisterNoteUpdatedCallback = () => void;

type Registration = {
    id: number;
    callback: NoteUpdatedCallback;
}

export class HokeiNotes {
    private nextId: number = 0;
    private callbackRegistrations: Map<string, Registration[]> = new Map<string, Registration[]>();

    constructor() {
        getAppDataStore().subscribe("notes", notes => {
            for (const [hokeiName, registrations] of this.callbackRegistrations) {
                const value = notes[hokeiName] ?? null;
                for (const registration of registrations) {
                    registration.callback(value);
                }
            }
        });
    }

    registerListener(hokeiName: string, callback: NoteUpdatedCallback): UnregisterNoteUpdatedCallback {
        const id = this.nextId++;

        const registrations = this.callbackRegistrations.get(hokeiName) ?? [];
        registrations.push({ id, callback });
        this.callbackRegistrations.set(hokeiName, registrations);

        return () => {
            const index = registrations.findIndex(e => e.id === id);
            if (index >= 0)
                registrations.splice(index);
        }
    }

    getNotes(hokeiName: string): string | null {
        const notes = getAppDataStore().get("notes");
        return notes[hokeiName] ?? null;
    }

    setNotes(hokeiName: string, notes: string | null) {
        const store = getAppDataStore();
        const existingNotes = store.get("notes");

        if (notes) {
            if (existingNotes[hokeiName] !== notes) {
                store.set("notes", { ...existingNotes, [hokeiName]: notes });
            }
        } else {
            if (hokeiName in existingNotes) {
                const updatedNotes = { ...existingNotes };
                delete updatedNotes[hokeiName];
                store.set("notes", updatedNotes);
            }
        }
    }
}

type RankUpdatedCallback = (rank: HokeiRankValue | null) => void;
type UnregisterRankUpdatedCallback = () => void;

type RankRegistration = {
    id: number;
    callback: RankUpdatedCallback;
}

export class HokeiRanks {
    private nextId: number = 0;
    private callbackRegistrations: Map<string, RankRegistration[]> = new Map<string, RankRegistration[]>();

    constructor() {
        getAppDataStore().subscribe("hokeiRanks", ranks => {
            for (const [hokeiName, registrations] of this.callbackRegistrations) {
                const value = ranks[hokeiName]?.value ?? null;
                for (const registration of registrations) {
                    registration.callback(value);
                }
            }
        });
    }

    registerListener(hokeiName: string, callback: RankUpdatedCallback): UnregisterRankUpdatedCallback {
        const id = this.nextId++;
        const registrations = this.callbackRegistrations.get(hokeiName) ?? [];
        registrations.push({ id, callback });
        this.callbackRegistrations.set(hokeiName, registrations);

        return () => {
            const index = registrations.findIndex(e => e.id === id);
            if (index >= 0)
                registrations.splice(index, 1);
        };
    }

    getRank(hokeiName: string): HokeiRankValue | null {
        const ranks = getAppDataStore().get("hokeiRanks");
        return ranks[hokeiName]?.value ?? null;
    }

    setRank(hokeiName: string, rank: HokeiRankValue | null): void {
        const store = getAppDataStore();
        const existingRanks = store.get("hokeiRanks");

        if (rank === null) {
            if (!(hokeiName in existingRanks)) {
                return;
            }

            const updatedRanks = { ...existingRanks };
            delete updatedRanks[hokeiName];
            store.set("hokeiRanks", updatedRanks);
            return;
        }

        const existing = existingRanks[hokeiName];
        if (existing?.value === rank) {
            return;
        }

        store.set("hokeiRanks", {
            ...existingRanks,
            [hokeiName]: {
                value: rank,
                updatedAt: new Date().toISOString(),
            }
        });
    }
}
