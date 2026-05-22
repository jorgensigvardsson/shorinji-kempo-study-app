import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("./persistence/store", () => ({ getAppDataStore: vi.fn() }));
vi.mock("./sync/manager", () => ({ getSyncManager: vi.fn() }));

import { getAppDataStore } from "./persistence/store";
import { getSyncManager } from "./sync/manager";
import { useTheme, useSyncProvider, useSyncState } from "./hooks";

type Listener = (v: unknown) => void;

function makeStore(initial: Record<string, unknown> = {}) {
  const listeners = new Map<string, Set<Listener>>();
  const data: Record<string, unknown> = { theme: "system", syncProvider: "local", ...initial };

  return {
    get: vi.fn((key: string) => data[key]),
    set: vi.fn((key: string, value: unknown) => {
      data[key] = value;
      listeners.get(key)?.forEach(cb => cb(value));
    }),
    subscribe: vi.fn((key: string, cb: Listener) => {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(cb);
      return () => listeners.get(key)!.delete(cb);
    }),
  };
}

type SyncState = {
  status: string;
  message: string | null;
  error: Error | null;
  lastSyncedAt: string | null;
  lastConflictResolutionAt: string | null;
};

function makeManager(initialState: Partial<SyncState> = {}) {
  const state: SyncState = {
    status: "local_only",
    message: null,
    error: null,
    lastSyncedAt: null,
    lastConflictResolutionAt: null,
    ...initialState,
  };
  const subscribers = new Set<Listener>();
  return {
    getState: vi.fn(() => ({ ...state })),
    subscribe: vi.fn((cb: Listener) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    }),
    emit: (newState: SyncState) => subscribers.forEach(cb => cb(newState)),
  };
}

// ─── useTheme ────────────────────────────────────────────────────────────────

describe("useTheme", () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ theme: "light" });
    vi.mocked(getAppDataStore).mockReturnValue(store as never);
  });

  it("reads the current theme from the store", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("effectiveTheme equals the explicit theme when not system", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.effectiveTheme).toBe("light");
  });

  it("effectiveTheme resolves system to light or dark", () => {
    store = makeStore({ theme: "system" });
    vi.mocked(getAppDataStore).mockReturnValue(store as never);
    const { result } = renderHook(() => useTheme());
    expect(["light", "dark"]).toContain(result.current.effectiveTheme);
  });

  it("setTheme updates the returned theme", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));
    expect(result.current.theme).toBe("dark");
  });

  it("reflects a store-driven external change", () => {
    const { result } = renderHook(() => useTheme());
    act(() => store.set("theme", "dark"));
    expect(result.current.theme).toBe("dark");
  });
});

// ─── useSyncProvider ─────────────────────────────────────────────────────────

describe("useSyncProvider", () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore({ syncProvider: "google_drive" });
    vi.mocked(getAppDataStore).mockReturnValue(store as never);
  });

  it("reads the current syncProvider from the store", () => {
    const { result } = renderHook(() => useSyncProvider());
    expect(result.current.syncProvider).toBe("google_drive");
  });

  it("setSyncProvider updates the returned provider", () => {
    const { result } = renderHook(() => useSyncProvider());
    act(() => result.current.setSyncProvider("local" as never));
    expect(result.current.syncProvider).toBe("local");
  });

  it("reflects a store-driven external change", () => {
    const { result } = renderHook(() => useSyncProvider());
    act(() => store.set("syncProvider", "onedrive"));
    expect(result.current.syncProvider).toBe("onedrive");
  });
});

// ─── useSyncState ────────────────────────────────────────────────────────────

describe("useSyncState", () => {
  it("returns the initial state from the manager", () => {
    const manager = makeManager({ status: "connected" });
    vi.mocked(getSyncManager).mockReturnValue(manager as never);
    const { result } = renderHook(() => useSyncState());
    expect(result.current.status).toBe("connected");
  });

  it("updates when the manager emits a new state", () => {
    const manager = makeManager();
    vi.mocked(getSyncManager).mockReturnValue(manager as never);
    const { result } = renderHook(() => useSyncState());
    act(() => manager.emit({ status: "syncing", message: null, error: null, lastSyncedAt: null, lastConflictResolutionAt: null }));
    expect(result.current.status).toBe("syncing");
  });

  it("unsubscribes from the manager on unmount", () => {
    const manager = makeManager();
    vi.mocked(getSyncManager).mockReturnValue(manager as never);
    const { unmount } = renderHook(() => useSyncState());
    unmount();
    // After unmount, emitting should not cause errors (subscriber was removed)
    expect(() =>
      manager.emit({ status: "error", message: "x", error: null, lastSyncedAt: null, lastConflictResolutionAt: null })
    ).not.toThrow();
  });
});
