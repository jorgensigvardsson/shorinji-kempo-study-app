// Stands in for `virtual:pwa-register/react`, which vite-plugin-pwa generates during
// a build and which therefore does not exist under vitest. Registering a service
// worker is not something a test wants to happen anyway; what a test wants is to
// drive the callbacks, so the options are handed back for it to call.

export interface RegisterSWOptions {
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
}

let latest: RegisterSWOptions = {};

export function useRegisterSW(options: RegisterSWOptions = {}) {
    latest = options;
    return {
        needRefresh: [false, () => {}] as [boolean, (value: boolean) => void],
        offlineReady: [false, () => {}] as [boolean, (value: boolean) => void],
        updateServiceWorker: async () => {},
    };
}

// The options the component under test passed in, so a test can fire onNeedRefresh
// or hand over a registration and watch what the app does about it.
export const registeredSWOptions = (): RegisterSWOptions => latest;
