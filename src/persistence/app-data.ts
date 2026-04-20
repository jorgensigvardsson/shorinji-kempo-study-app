import { getAppDataStore } from "./store";

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
