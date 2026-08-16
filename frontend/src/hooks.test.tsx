import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("./persistence/store", () => ({ getAppDataStore: vi.fn() }));
vi.mock("./sync/manager", () => ({ getSyncManager: vi.fn() }));

import { getSyncManager } from "./sync/manager";
import { useTheme, useSyncProvider, useSyncState } from "./hooks";
import { resetSyncProviderCache, setSyncProvider } from "./sync/provider";
import { resetThemePreferenceCache, setThemePreference } from "./persistence/theme";

type Listener = (v: unknown) => void;

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
  // Device-local now, like the sync provider below: these drive the real theme
  // module through localStorage rather than the synced app-data store.
  beforeEach(() => {
    localStorage.setItem("theme-preference", "light");
    resetThemePreferenceCache();
  });

  it("reads the current theme", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("applies the stored theme when the hook mounts", () => {
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute("data-bs-theme")).toBe("light");
  });

  it("effectiveTheme equals the explicit theme when not system", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.effectiveTheme).toBe("light");
  });

  it("effectiveTheme resolves system to light or dark", () => {
    localStorage.setItem("theme-preference", "system");
    resetThemePreferenceCache();
    const { result } = renderHook(() => useTheme());
    expect(["light", "dark"]).toContain(result.current.effectiveTheme);
  });

  it("setTheme updates the returned theme", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));
    expect(result.current.theme).toBe("dark");
  });

  it("reflects a change made elsewhere on this device", () => {
    const { result } = renderHook(() => useTheme());
    act(() => setThemePreference("dark"));
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.getAttribute("data-bs-theme")).toBe("dark");
  });
});

// ─── useSyncProvider ─────────────────────────────────────────────────────────

describe("useSyncProvider", () => {
  // Device-local now, not part of the synced document, so these drive the real
  // provider module through localStorage rather than the app-data store.
  beforeEach(() => {
    localStorage.setItem("sync-provider", "backend");
    resetSyncProviderCache();
  });

  it("reads the current provider", () => {
    const { result } = renderHook(() => useSyncProvider());
    expect(result.current.syncProvider).toBe("backend");
  });

  it("setSyncProvider updates the returned provider", () => {
    const { result } = renderHook(() => useSyncProvider());
    act(() => result.current.setSyncProvider("local"));
    expect(result.current.syncProvider).toBe("local");
    expect(localStorage.getItem("sync-provider")).toBe("local");
  });

  it("reflects a change made outside the hook", () => {
    const { result } = renderHook(() => useSyncProvider());
    act(() => setSyncProvider("local"));
    expect(result.current.syncProvider).toBe("local");
  });

  it("adopts the value from a document written before it moved out", () => {
    localStorage.clear();
    localStorage.setItem("app-data-document", JSON.stringify({ data: { syncProvider: "backend" } }));
    resetSyncProviderCache();

    // Nobody should be bounced back to the login screen by the move.
    const { result } = renderHook(() => useSyncProvider());
    expect(result.current.syncProvider).toBe("backend");
  });

  it("reads a device with no history at all as signed out", () => {
    localStorage.clear();
    resetSyncProviderCache();
    const { result } = renderHook(() => useSyncProvider());
    expect(result.current.syncProvider).toBe("local");
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
