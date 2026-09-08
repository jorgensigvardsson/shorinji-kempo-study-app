import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAppInstallation, useAppUpdate } from "./app-update";
import { registeredSWOptions } from "./test-stubs/pwa-register";

// VITE_APP_VERSION is unset under vitest, so the running build calls itself "dev".
// A server answering with anything else is therefore a server that has moved on.
const RunningVersion = "dev";
const NewerVersion = "9f3c1ab";

// A service worker sitting in `waiting` is a build that has downloaded but not taken
// over. Everything here is about when the user is told, what the button does about
// it, and — the part that stranded a real phone on an old build — what happens when
// the worker cannot or will not hand over.
const makeWorker = () => {
    const listeners = new Map<string, Array<() => void>>();
    return {
        state: "installed" as ServiceWorkerState,
        postMessage: vi.fn(),
        addEventListener: (type: string, fn: () => void) => {
            listeners.set(type, [...(listeners.get(type) ?? []), fn]);
        },
        removeEventListener: () => {},
        // Drives the worker through a state change the way the browser would.
        transitionTo(state: ServiceWorkerState) {
            this.state = state;
            act(() => { (listeners.get("statechange") ?? []).forEach(fn => fn()); });
        },
    };
};

type Worker = ReturnType<typeof makeWorker>;

const makeRegistration = (waiting: Worker | null) => ({
    waiting,
    installing: null,
    update: vi.fn().mockResolvedValue(undefined),
});

type Registration = ReturnType<typeof makeRegistration>;

const asRegistration = (registration: Registration) =>
    registration as unknown as ServiceWorkerRegistration;

const setVisibility = (state: "visible" | "hidden") => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
};

// Hands the hook a registration and lets its mount-time version check settle, so a
// test starts from the steady state rather than from a half-finished startup.
const start = async (registration: Registration | null, autoApply = false) => {
    const rendered = renderHook(() => useAppUpdate(autoApply));
    if (registration) {
        act(() => {
            registeredSWOptions().onRegisteredSW?.("/sw.js", asRegistration(registration));
        });
    }
    await act(async () => { await Promise.resolve(); });
    return rendered;
};

let reload: ReturnType<typeof vi.fn>;
let controllerChangeHandlers: Array<() => void>;
let unregister: ReturnType<typeof vi.fn>;
let cacheDelete: ReturnType<typeof vi.fn>;
let serverVersion: string | null;

// Fires the controllerchange the browser would fire once a new worker takes over.
const takeOver = () => act(() => { controllerChangeHandlers.forEach(fn => fn()); });

beforeEach(() => {
    sessionStorage.clear();
    serverVersion = RunningVersion;

    reload = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { reload } });

    controllerChangeHandlers = [];
    unregister = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
            addEventListener: (type: string, fn: () => void) => {
                if (type === "controllerchange") controllerChangeHandlers.push(fn);
            },
            getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
        },
    });

    cacheDelete = vi.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis, "caches", {
        configurable: true,
        value: { keys: vi.fn().mockResolvedValue(["precache-v1"]), delete: cacheDelete },
    });

    vi.stubGlobal("fetch", vi.fn(async () => {
        if (serverVersion === null) throw new Error("offline");
        return { ok: true, json: async () => ({ version: serverVersion }) } as Response;
    }));

    setVisibility("visible");
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("useAppUpdate", () => {
    it("says nothing until there is a new build", async () => {
        const { result } = await start(makeRegistration(null));
        expect(result.current.needRefresh).toBe(false);
    });

    it("prompts when the service worker reports one", async () => {
        const { result } = await start(makeRegistration(null));

        act(() => { registeredSWOptions().onNeedRefresh?.(); });

        expect(result.current.needRefresh).toBe(true);
    });

    // A build can already be waiting when the app starts — downloaded during a
    // previous visit that ended before it was applied.
    it("prompts when registration finds one already waiting", async () => {
        const { result } = await start(makeRegistration(makeWorker()));
        expect(result.current.needRefresh).toBe(true);
    });

    // The safety net. If the worker has stopped noticing new builds — or noticed one
    // and then lost it — the server is still there to be asked directly.
    it("prompts when the server is serving a build this one is not", async () => {
        serverVersion = NewerVersion;
        const { result } = await start(makeRegistration(null));
        await waitFor(() => expect(result.current.needRefresh).toBe(true));
    });

    // Being unable to reach the server is not evidence of being out of date, and a
    // toast that appears every time the train goes into a tunnel is worse than none.
    it("stays quiet when the server cannot be reached", async () => {
        serverVersion = null;
        const { result } = await start(makeRegistration(null));
        await act(async () => { await Promise.resolve(); });
        expect(result.current.needRefresh).toBe(false);
    });

    // The regression that stranded a phone: the prompt outlived the worker it was
    // offering, leaving a button wired to something that no longer existed.
    it("takes the prompt back down when the waiting build dies", async () => {
        const waiting = makeWorker();
        const registration = makeRegistration(waiting);
        const { result } = await start(registration);
        expect(result.current.needRefresh).toBe(true);

        // The system evicted it, or a newer build superseded it.
        registration.waiting = null;
        waiting.transitionTo("redundant");

        expect(result.current.needRefresh).toBe(false);
    });

    it("hands over to the waiting build and reloads once it takes over", async () => {
        const waiting = makeWorker();
        const { result } = await start(makeRegistration(waiting));

        act(() => { result.current.applyUpdate(); });
        await act(async () => { await Promise.resolve(); });

        expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
        expect(reload).not.toHaveBeenCalled(); // The reload comes from the handover.

        takeOver();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    // iOS will not always start a terminated worker to deliver it a message, so the
    // handover can be accepted by nobody and controllerchange never arrive. Without
    // the watchdog that is a tap that silently does nothing, forever.
    it("reloads anyway when the handover is never acknowledged", async () => {
        vi.useFakeTimers();
        const waiting = makeWorker();
        const { result } = await start(makeRegistration(waiting));

        act(() => { result.current.applyUpdate(); });
        await act(async () => { await Promise.resolve(); });
        expect(reload).not.toHaveBeenCalled();

        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

        expect(reload).toHaveBeenCalledTimes(1);
    });

    it("reloads only once when the handover is acknowledged late", async () => {
        vi.useFakeTimers();
        const waiting = makeWorker();
        const { result } = await start(makeRegistration(waiting));

        act(() => { result.current.applyUpdate(); });
        await act(async () => { await Promise.resolve(); });
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        takeOver();

        expect(reload).toHaveBeenCalledTimes(1);
    });

    // With no worker to hand over to, the old button did nothing at all and left the
    // prompt on screen. Now it goes and asks for one.
    it("goes looking for a build when none is waiting", async () => {
        const registration = makeRegistration(null);
        const found = makeWorker();
        registration.update.mockImplementation(async () => { registration.waiting = found; });
        const { result } = await start(registration);

        act(() => { result.current.applyUpdate(); });
        await waitFor(() => expect(found.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" }));
    });

    // ...and when there is no build to be had but the server is demonstrably ahead,
    // the worker is the thing standing in the way. Clear it out.
    it("clears the installation when the server is ahead and no build can be had", async () => {
        serverVersion = NewerVersion;
        const { result } = await start(makeRegistration(null));
        await waitFor(() => expect(result.current.needRefresh).toBe(true));

        act(() => { result.current.applyUpdate(); });

        await waitFor(() => expect(unregister).toHaveBeenCalled());
        expect(cacheDelete).toHaveBeenCalledWith("precache-v1");
        expect(reload).toHaveBeenCalled();
    });

    // A handover was tried in this session and the app came back running the same
    // build as before. Offering the same button again would just repeat it.
    it("clears the installation when a handover has already failed this session", async () => {
        sessionStorage.setItem("app-update-handover-attempts", "1");
        serverVersion = NewerVersion;

        await start(makeRegistration(null));

        await waitFor(() => expect(unregister).toHaveBeenCalled());
    });

    // A reload loop in an installed app is worse than a stuck one: the user cannot
    // even get to the screen that would let them report it.
    it("never clears the installation twice in one session", async () => {
        sessionStorage.setItem("app-update-handover-attempts", "1");
        sessionStorage.setItem("app-update-reset-done", "true");
        serverVersion = NewerVersion;

        const { result } = await start(makeRegistration(null));
        await waitFor(() => expect(result.current.needRefresh).toBe(true));

        expect(unregister).not.toHaveBeenCalled();
    });

    // Nobody is signed in, so there is no work in progress to interrupt: a pending
    // build is taken silently rather than being offered.
    it("applies without prompting when there is nothing to interrupt", async () => {
        const waiting = makeWorker();
        await start(makeRegistration(waiting), true);

        await waitFor(() => expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" }));
    });

    // The silent path runs unprompted on every load, so a blind reload from it is
    // not a retry — it is a loop, on the login screen of an installed app that has
    // no address bar to escape from. It gets one teardown and then stands down.
    it("does not reload in a loop when the silent path has run out of options", async () => {
        sessionStorage.setItem("app-update-handover-attempts", "3");
        sessionStorage.setItem("app-update-reset-done", "true");
        serverVersion = NewerVersion;

        const { result } = await start(makeRegistration(null), true);
        await waitFor(() => expect(result.current.needRefresh).toBe(true));
        await act(async () => { await Promise.resolve(); });

        expect(reload).not.toHaveBeenCalled();
        expect(unregister).not.toHaveBeenCalled();
    });

    // A tap is a person asking, once, so it still gets its reload.
    it("still reloads for a tap when the silent path would have stood down", async () => {
        sessionStorage.setItem("app-update-handover-attempts", "3");
        sessionStorage.setItem("app-update-reset-done", "true");
        serverVersion = NewerVersion;

        const { result } = await start(makeRegistration(null));
        await waitFor(() => expect(result.current.needRefresh).toBe(true));

        act(() => { result.current.applyUpdate(); });

        await waitFor(() => expect(reload).toHaveBeenCalled());
    });

    // On a phone the hourly timer is suspended the whole time the app is off screen,
    // so coming back is very nearly the only moment a check can happen at all.
    it("checks again when the app comes back into view", async () => {
        vi.useFakeTimers();
        const registration = makeRegistration(null);
        const { result } = await start(registration);
        const before = registration.update.mock.calls.length;

        serverVersion = NewerVersion;
        await act(async () => { await vi.advanceTimersByTimeAsync(61 * 1000); });
        setVisibility("hidden");
        setVisibility("visible");
        await act(async () => { await Promise.resolve(); });

        expect(result.current.needRefresh).toBe(true);
        expect(registration.update.mock.calls.length).toBeGreaterThan(before);
    });

    // Switching between apps is not a reason to re-ask the server every time; a
    // waiting build is still picked up on the way back regardless.
    it("does not re-ask the server on every glance at the app", async () => {
        vi.useFakeTimers();
        const registration = makeRegistration(null);
        await start(registration);
        const before = registration.update.mock.calls.length;

        setVisibility("hidden");
        setVisibility("visible");
        await act(async () => { await Promise.resolve(); });

        expect(registration.update.mock.calls.length).toBe(before);
    });

    it("still notices a build waiting on the way back in", async () => {
        const registration = makeRegistration(null);
        const { result } = await start(registration);
        expect(result.current.needRefresh).toBe(false);

        registration.waiting = makeWorker();
        setVisibility("hidden");
        setVisibility("visible");

        expect(result.current.needRefresh).toBe(true);
    });

    it("keeps asking while the app stays open", async () => {
        vi.useFakeTimers();
        const registration = makeRegistration(null);
        await start(registration);
        const before = registration.update.mock.calls.length;

        await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000 * 3); });

        expect(registration.update.mock.calls.length).toBe(before + 3);
    });

    it("stops asking once the app is gone", async () => {
        vi.useFakeTimers();
        const registration = makeRegistration(null);
        const { unmount } = await start(registration);
        unmount();
        const after = registration.update.mock.calls.length;

        await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000 * 3); });

        expect(registration.update.mock.calls.length).toBe(after);
    });
});

describe("resetAppInstallation", () => {
    it("unregisters every worker, empties every cache, and reloads", async () => {
        await resetAppInstallation();

        expect(unregister).toHaveBeenCalled();
        expect(cacheDelete).toHaveBeenCalledWith("precache-v1");
        expect(reload).toHaveBeenCalled();
    });

    // Whatever it managed to clear is better than nothing, and the reload is the part
    // the user is actually waiting for.
    it("reloads even when the teardown fails", async () => {
        unregister.mockRejectedValue(new Error("nope"));

        await resetAppInstallation();

        expect(reload).toHaveBeenCalled();
    });
});
