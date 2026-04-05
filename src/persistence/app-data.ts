interface StringMap {
  [key: string]: string;
}

type NoteUpdatedCallback = (notes: string | null) => void;
type UnregisterNoteUpdatedCallback = () => void;

type Registration = {
    id: number;
    callback: NoteUpdatedCallback;
}

const hokeiNotesPersistentName = "hokei-notes";

export class HokeiNotes {
    private readonly notes: StringMap;
    private nextId: number = 0;
    private callbackRegistrations: Map<string, Registration[]> = new Map<string, Registration[]>();

    constructor() {
        this.notes = JSON.parse(localStorage.getItem(hokeiNotesPersistentName) ?? '{}');
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
        return this.notes[hokeiName] ?? null;
    }

    setNotes(hokeiName: string, notes: string | null) {
        if (notes) {
            if (this.notes[hokeiName] !== notes) {
                this.notes[hokeiName] = notes;
                this.saveData();
                this.fireChangeNotification(hokeiName, notes);
            }
        } else {
            if (hokeiName in this.notes) {
                delete this.notes[hokeiName];
                this.saveData();
                this.fireChangeNotification(hokeiName, null);
            }
        }
    }

    private saveData() {
        localStorage.setItem(hokeiNotesPersistentName, JSON.stringify(this.notes));
    }

    private fireChangeNotification(hokeiName: string, notes: string | null) {
        const registrations = this.callbackRegistrations.get(hokeiName);
        if (!registrations)
            return;

        for (const registration of registrations) {
            registration.callback(notes);
        }
    }
}