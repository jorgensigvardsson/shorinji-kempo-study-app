import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppUpdate } from "./app-update";
import { registeredSWOptions } from "./test-stubs/pwa-register";

// A service worker sitting in `waiting` is a build that has downloaded but not taken
// over. Everything here is about when the user is told, and when it happens silently.
const makeWaiting = () => ({ postMessage: vi.fn() });

const makeRegistration = (waiting: { postMessage: ReturnType<typeof vi.fn> } | null) =>
    ({ waiting, update: vi.fn() } as unknown as ServiceWorkerRegistration);

const setVisibility = (state: "visible" | "hidden") => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
};

let reload: ReturnType<typeof vi.fn>;
let controllerChange: ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.useFakeTimers();
    reload = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { reload } });
    controllerChange = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: { addEventListener: controllerChange },
    });
    setVisibility("visible");
});

afterEach(() => {
    vi.useRealTimers();
});

describe("useAppUpdate", () => {
    it("says nothing until there is a new build", () => {
        const { result } = renderHook(() => useAppUpdate(false));
        expect(result.current.needRefresh).toBe(false);
    });

    it("prompts when the service worker reports one", () => {
        const { result } = renderHook(() => useAppUpdate(false));

        act(() => { registeredSWOptions().onNeedRefresh?.(); });

        expect(result.current.needRefresh).toBe(true);
    });

    // A build can already be waiting when the app starts — downloaded during a
    // previous visit that ended before it was applied.
    it("prompts when registration finds one already waiting", () => {
        const { result } = renderHook(() => useAppUpdate(false));

        act(() => { registeredSWOptions().onRegisteredSW?.("/sw.js", makeRegistration(makeWaiting())); });

        expect(result.current.needRefresh).toBe(true);
    });

    it("stays quiet when registration finds nothing waiting", () => {
        const { result } = renderHook(() => useAppUpdate(false));

        act(() => { registeredSWOptions().onRegisteredSW?.("/sw.js", makeRegistration(null)); });

        expect(result.current.needRefresh).toBe(false);
    });

    // Returning to a long-backgrounded tab is the likeliest moment for a build to have
    // arrived unnoticed, so coming back into view re-checks rather than waiting for
    // the service worker to say something again.
    it("re-checks for a waiting build when the app comes back into view", () => {
        const { result } = renderHook(() => useAppUpdate(false));
        const registration = makeRegistration(makeWaiting());
        act(() => { registeredSWOptions().onRegisteredSW?.("/sw.js", registration); });
        act(() => { result.current.applyUpdate(); });
        expect(result.current.needRefresh).toBe(false);

        setVisibility("hidden");
        setVisibility("visible");

        expect(result.current.needRefresh).toBe(true);
    });

    it("does not prompt on return when nothing is waiting", () => {
        const { result } = renderHook(() => useAppUpdate(false));
        act(() => { registeredSWOptions().onRegisteredSW?.("/sw.js", makeRegistration(null)); });

        setVisibility("hidden");
        setVisibility("visible");

        expect(result.current.needRefresh).toBe(false);
    });

    it("hands over to the waiting build and drops the prompt", () => {
        const waiting = makeWaiting();
        const { result } = renderHook(() => useAppUpdate(false));
        act(() => { registeredSWOptions().onRegisteredSW?.("/sw.js", makeRegistration(waiting)); });

        act(() => { result.current.applyUpdate(); });

        expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
        expect(result.current.needRefresh).toBe(false);
        // The reload comes from the worker taking over, not from here.
        expect(controllerChange).toHaveBeenCalledWith("controllerchange", expect.any(Function), { once: true });
        expect(reload).not.toHaveBeenCalled();
    });

    // Nobody is signed in, so there is no work in progress to interrupt: a pending
    // build is taken silently rather than being offered.
    it("applies without prompting when there is nothing to interrupt", () => {
        const waiting = makeWaiting();
        const { result } = renderHook(() => useAppUpdate(true));

        act(() => { registeredSWOptions().onRegisteredSW?.("/sw.js", makeRegistration(waiting)); });

        expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
        expect(result.current.needRefresh).toBe(true); // cleared by the reload, not here
    });

    // Used when syncing has stopped because this build is too old to write safely.
    // Waiting for the usual prompt is not good enough there, so it reloads regardless.
    it("reloadIntoLatest takes a waiting build when there is one", () => {
        const waiting = makeWaiting();
        const { result } = renderHook(() => useAppUpdate(false));
        act(() => { registeredSWOptions().onRegisteredSW?.("/sw.js", makeRegistration(waiting)); });

        act(() => { result.current.reloadIntoLatest(); });

        expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
        expect(reload).not.toHaveBeenCalled();
    });

    it("reloadIntoLatest reloads outright when nothing is waiting", () => {
        const { result } = renderHook(() => useAppUpdate(false));
        act(() => { registeredSWOptions().onRegisteredSW?.("/sw.js", makeRegistration(null)); });

        act(() => { result.current.reloadIntoLatest(); });

        expect(reload).toHaveBeenCalled();
    });

    it("keeps asking the registration for updates while the app is open", () => {
        const registration = makeRegistration(null);
        renderHook(() => useAppUpdate(false));
        act(() => { registeredSWOptions().onRegisteredSW?.("/sw.js", registration); });

        act(() => { vi.advanceTimersByTime(60 * 60 * 1000 * 3); });

        expect(registration.update).toHaveBeenCalledTimes(3);
    });
});
