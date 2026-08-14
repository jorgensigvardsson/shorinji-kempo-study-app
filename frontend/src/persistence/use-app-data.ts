import { useCallback, useSyncExternalStore } from "react";
import { getAppDataStore } from "./store";
import type { AppDataState } from "./schema";

/**
 * Subscribes a component to a single key of the app-data document.
 *
 * The store is already an external store: `subscribe(key, cb)` plus `get(key)`
 * is exactly the contract `useSyncExternalStore` expects. So there is nothing to
 * mirror into `useState` and no effect to run — React subscribes on mount,
 * unsubscribes on unmount, and re-renders when the value changes.
 *
 * `get` reads straight out of the current document and `set` replaces that
 * document wholesale, so the returned snapshot keeps a stable identity until the
 * value genuinely changes. That is what `useSyncExternalStore` requires; a
 * getter that built a fresh object each call would loop forever.
 */
export function useAppData<TKey extends keyof AppDataState>(key: TKey): AppDataState[TKey] {
    // Only `subscribe` needs a stable identity — React re-subscribes whenever it
    // changes. `getSnapshot` is merely called, so an inline arrow is fine.
    const subscribe = useCallback(
        (onStoreChange: () => void) => getAppDataStore().subscribe(key, onStoreChange),
        [key]
    );

    return useSyncExternalStore(subscribe, () => getAppDataStore().get(key));
}

/**
 * Writes one key of the app-data document, notifying every `useAppData` reader.
 *
 * Deliberately a plain function rather than a hook: the store is a singleton, so
 * a writer needs no React state of its own and can be called from event
 * handlers, callbacks, or non-component code alike.
 */
export function setAppData<TKey extends keyof AppDataState>(key: TKey, value: AppDataState[TKey]): void {
    getAppDataStore().set(key, value);
}
