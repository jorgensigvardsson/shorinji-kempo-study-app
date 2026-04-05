type DataUpdatedCallback<TData> = (data: TData) => void;
type UnregisterDataUpdatedCallback = () => void;

export interface Data<TData> {
    readonly name: string;
    readonly data: TData;
    save(data: TData): void;
    registerListener(callback: DataUpdatedCallback<TData>): UnregisterDataUpdatedCallback;
}

export function load<TData>(name: string, defaultData: TData): Data<TData> {
    var data = localStorage.getItem(name);
    const deserializedData = data === null ? defaultData : (typeof defaultData === "string" ? data as TData : JSON.parse(data) as TData);
    return new DataImplementation<TData>(name, deserializedData);
}

type Registration<TData> = {
    id: number;
    callback: DataUpdatedCallback<TData>;
}

class DataImplementation<TData> {
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
                this.callbackRegistrations.splice(index);
        }
    }
}