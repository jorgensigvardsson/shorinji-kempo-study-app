import { getAppDataStore } from "./store";
import type { AppDataState } from "./schema";

type DataUpdatedCallback<TData> = (data: TData) => void;
type UnregisterDataUpdatedCallback = () => void;

export interface Data<TData> {
    readonly name: string;
    readonly data: TData;
    save(data: TData): void;
    registerListener(callback: DataUpdatedCallback<TData>): UnregisterDataUpdatedCallback;
}

export function load<TData>(name: string, defaultData: TData): Data<TData> {
    const mappedKey = persistentNameToAppDataKey(name);

    if (!mappedKey) {
        const localData = localStorage.getItem(name);
        const deserializedData =
            localData === null
                ? defaultData
                : (typeof defaultData === "string" ? localData as TData : JSON.parse(localData) as TData);
        return new LocalDataImplementation<TData>(name, deserializedData);
    }

    const store = getAppDataStore();
    const data = store.get(mappedKey) as TData;
    return new StoreDataImplementation<TData>(name, mappedKey, data);
}

type Registration<TData> = {
    id: number;
    callback: DataUpdatedCallback<TData>;
}

class StoreDataImplementation<TData> {
    constructor(public name: string, private appDataKey: keyof AppDataState, public data: TData) {}

    save(data: TData) {
        const store = getAppDataStore();
        store.set(this.appDataKey as never, data as never);
        this.data = data;
    }

    registerListener(callback: DataUpdatedCallback<TData>): UnregisterDataUpdatedCallback {
        return getAppDataStore().subscribe(this.appDataKey as never, value => {
            this.data = value as TData;
            callback(value as TData);
        });
    }
}

class LocalDataImplementation<TData> {
    private nextId: number = 0;
    private callbackRegistrations: Registration<TData>[] = [];

    constructor(public name: string, public data: TData) {}

    save(data: TData) {
        const serializedData = typeof data === "string" ? data : JSON.stringify(data);
        localStorage.setItem(this.name, serializedData);
        this.data = data;
        for (const registration of this.callbackRegistrations) {
            registration.callback(data);
        }
    }

    registerListener(callback: DataUpdatedCallback<TData>): UnregisterDataUpdatedCallback {
        const id = this.nextId++;

        this.callbackRegistrations.push({ id, callback });
        return () => {
            const index = this.callbackRegistrations.findIndex(e => e.id === id);
            if (index >= 0)
                this.callbackRegistrations.splice(index, 1);
        }
    }
}

function persistentNameToAppDataKey(name: string): keyof AppDataState | null {
    switch (name) {
        case "grade":
            return "grade";
        case "language":
            return "language";
        default:
            return null;
    }
}
