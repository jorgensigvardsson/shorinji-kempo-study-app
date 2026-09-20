import { createContext, useContext, useState, type SetStateAction } from "react";

// Navigation preferences belong to this browser and account, not the synced
// study document. A signed-out visitor never mounts the account's provider.
export const BrowserStateScope = createContext("preview");

export function readBrowserState<T>(storage: Storage, key: string, fallback: T, valid: (value: unknown) => value is T): T {
    try {
        const value: unknown = JSON.parse(storage.getItem(key) ?? "null");
        return valid(value) ? value : fallback;
    } catch {
        return fallback;
    }
}

export function useBrowserState<T>(name: string, fallback: T, valid: (value: unknown) => value is T, permanent = false) {
    const scope = useContext(BrowserStateScope);
    const key = `navigation:${scope}:${name}`;
    const storage = permanent ? localStorage : sessionStorage;
    const [saved, setSaved] = useState(() => ({ key, value: readBrowserState(storage, key, fallback, valid) }));
    let value = saved.value;
    if (saved.key !== key) {
        value = readBrowserState(storage, key, fallback, valid);
        setSaved({ key, value });
    }
    const setValue = (update: SetStateAction<T>) => {
        const next = typeof update === "function" ? (update as (previous: T) => T)(value) : update;
        try { storage.setItem(key, JSON.stringify(next)); } catch { /* Memory still works when storage is full. */ }
        setSaved({ key, value: next });
    };
    return [value, setValue] as const;
}

export const isText = (value: unknown): value is string => typeof value === "string" && value.length <= 2000;
export const isIndex = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0;
