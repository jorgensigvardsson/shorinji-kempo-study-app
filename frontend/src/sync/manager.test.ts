import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDataDocument } from "../persistence/schema";
import { createDefaultAppDataDocument } from "../persistence/schema";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<AppDataDocument> = {}): AppDataDocument {
  return {
    ...createDefaultAppDataDocument(),
    updatedAt: "2024-01-01T00:00:00.000Z",
    deviceId: "test-device",
    ...overrides,
  };
}

/** Flush the microtask queue enough times to let promise chains settle. */
async function flushPromises() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

type MockClient = {
  beginAuthorization: ReturnType<typeof vi.fn>;
  completeAuthorizationIfPresent: ReturnType<typeof vi.fn>;
  isConnected: ReturnType<typeof vi.fn>;
  wasAuthExpired: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  downloadDocument: ReturnType<typeof vi.fn>;
  uploadDocument: ReturnType<typeof vi.fn>;
};

function makeMockClient(): MockClient {
  return {
    beginAuthorization: vi.fn().mockResolvedValue(undefined),
    completeAuthorizationIfPresent: vi.fn().mockResolvedValue(false),
    isConnected: vi.fn().mockReturnValue(true),
    wasAuthExpired: vi.fn().mockReturnValue(false),
    disconnect: vi.fn(),
    downloadDocument: vi.fn().mockResolvedValue(null),
    uploadDocument: vi.fn().mockResolvedValue(undefined),
  };
}

type MockStore = {
  get: ReturnType<typeof vi.fn>;
  getDocument: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  setDocument: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  subscribeDocument: ReturnType<typeof vi.fn>;
};

function makeMockStore(provider = "backend", doc?: AppDataDocument): MockStore {
  const localDoc = doc ?? makeDoc();
  return {
    get: vi.fn((key: string) =>
      key === "syncProvider" ? provider : (localDoc.data as Record<string, unknown>)[key]
    ),
    getDocument: vi.fn(() => ({ ...localDoc })),
    set: vi.fn(),
    setDocument: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
    subscribeDocument: vi.fn().mockReturnValue(() => {}),
  };
}

// ─── test suite ───────────────────────────────────────────────────────────────

describe("SyncManager", () => {
  let mockBackendClient: MockClient;
  let mockStore: MockStore;
  let getSyncManager: typeof import("./manager").getSyncManager;
  // Dynamically imported after vi.resetModules() so instanceof checks match the fresh module.
  let AuthExpiredError: typeof import("./types").AuthExpiredError;

  beforeEach(async () => {
    localStorage.clear();
    mockBackendClient = makeMockClient();
    mockStore = makeMockStore();

    vi.resetModules();
    // A regular function (not an arrow function) is required here — arrow functions cannot
    // be used as constructors, and SyncManager instantiates this with `new`.
    vi.doMock("./backend", () => ({ BackendSyncClient: function() { return mockBackendClient; } }));
    vi.doMock("../persistence/store", () => ({ getAppDataStore: function() { return mockStore; } }));

    ({ getSyncManager } = await import("./manager"));
    ({ AuthExpiredError } = await import("./types"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── getState / subscribe ──────────────────────────────────────────────────

  describe("getState / subscribe", () => {
    it("initial state is local_only", () => {
      expect(getSyncManager().getState().status).toBe("local_only");
    });

    it("getState returns a snapshot — mutations do not affect internal state", () => {
      const manager = getSyncManager();
      const state = manager.getState();
      (state as { status: string }).status = "connected";
      expect(manager.getState().status).toBe("local_only");
    });

    it("subscribe listener receives state updates", async () => {
      mockStore.get.mockImplementation((k: string) => k === "syncProvider" ? "local" : undefined);
      const manager = getSyncManager();
      const received: string[] = [];
      manager.subscribe(s => received.push(s.status));
      await manager.syncNow();
      expect(received).toContain("local_only");
    });

    it("unsubscribe stops receiving state updates", async () => {
      mockStore.get.mockImplementation((k: string) => k === "syncProvider" ? "local" : undefined);
      const manager = getSyncManager();
      const cb = vi.fn();
      const unsub = manager.subscribe(cb);
      unsub();
      await manager.syncNow();
      expect(cb).not.toHaveBeenCalled();
    });

    it("multiple subscribers all receive the same update", async () => {
      mockStore.get.mockImplementation((k: string) => k === "syncProvider" ? "local" : undefined);
      const manager = getSyncManager();
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      manager.subscribe(cb1);
      manager.subscribe(cb2);
      await manager.syncNow();
      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });
  });

  // ─── syncNow ──────────────────────────────────────────────────────────────

  describe("syncNow", () => {
    it("returns local_only result and sets status when signed out", async () => {
      mockStore.get.mockReturnValue("local");
      const manager = getSyncManager();
      const result = await manager.syncNow();
      expect(result).toEqual({ conflictDetected: false, pushedLocalChanges: false });
      expect(manager.getState().status).toBe("local_only");
      expect(mockBackendClient.downloadDocument).not.toHaveBeenCalled();
    });

    it("sets disconnected when the client is not connected", async () => {
      mockBackendClient.isConnected.mockReturnValue(false);
      const manager = getSyncManager();
      await manager.syncNow();
      expect(manager.getState().status).toBe("disconnected");
    });

    it("uploads local doc as initial when no remote document exists", async () => {
      const localDoc = makeDoc({ updatedAt: "2024-06-01T00:00:00.000Z" });
      mockStore.getDocument.mockReturnValue(localDoc);
      mockBackendClient.downloadDocument.mockResolvedValue(null);

      const manager = getSyncManager();
      const result = await manager.syncNow();

      expect(mockBackendClient.uploadDocument).toHaveBeenCalledWith(localDoc);
      expect(result.pushedLocalChanges).toBe(true);
      expect(result.conflictDetected).toBe(false);
      expect(manager.getState().status).toBe("connected");
    });

    it("saves base document to localStorage after initial upload", async () => {
      mockStore.getDocument.mockReturnValue(makeDoc());
      mockBackendClient.downloadDocument.mockResolvedValue(null);

      await getSyncManager().syncNow();

      expect(localStorage.getItem("sync-base-document:backend")).not.toBeNull();
    });

    it("applies remote changes to local store when remote is newer", async () => {
      const localDoc = makeDoc({ updatedAt: "2024-01-01T00:00:00.000Z" });
      const remoteDoc = makeDoc({
        updatedAt: "2024-06-01T00:00:00.000Z",
        data: { ...localDoc.data, grade: "nidan" as const },
      });
      mockStore.getDocument.mockReturnValue(localDoc);
      mockBackendClient.downloadDocument.mockResolvedValue(remoteDoc);

      const manager = getSyncManager();
      await manager.syncNow();

      expect(mockStore.setDocument).toHaveBeenCalled();
      expect(manager.getState().status).toBe("connected");
    });

    it("uploads merged document when local is ahead of remote", async () => {
      const remoteDoc = makeDoc({ updatedAt: "2024-01-01T00:00:00.000Z" });
      const localDoc = makeDoc({
        updatedAt: "2024-06-01T00:00:00.000Z",
        data: { ...remoteDoc.data, grade: "sandan" as const },
      });
      mockStore.getDocument.mockReturnValue(localDoc);
      mockBackendClient.downloadDocument.mockResolvedValue(remoteDoc);

      const result = await getSyncManager().syncNow();

      expect(mockBackendClient.uploadDocument).toHaveBeenCalled();
      expect(result.pushedLocalChanges).toBe(true);
    });

    it("does not upload or apply on second sync when nothing changed", async () => {
      // First sync normalises the document key order and saves the base.
      const doc = makeDoc();
      mockStore.getDocument.mockReturnValue(doc);
      mockBackendClient.downloadDocument.mockResolvedValue(null);
      const manager = getSyncManager();
      await manager.syncNow(); // initial upload

      // Second sync: remote is the doc we just uploaded; local is the normalised form.
      const uploaded = mockBackendClient.uploadDocument.mock.calls[0][0] as AppDataDocument;
      mockStore.getDocument.mockReturnValue(uploaded);
      mockBackendClient.downloadDocument.mockResolvedValue(uploaded);
      mockBackendClient.uploadDocument.mockClear();
      mockStore.setDocument.mockClear();

      await manager.syncNow();

      expect(mockStore.setDocument).not.toHaveBeenCalled();
      expect(mockBackendClient.uploadDocument).not.toHaveBeenCalled();
      expect(manager.getState().status).toBe("connected");
    });

    it("detects conflict and sets conflict_resolution state", async () => {
      const baseDoc = makeDoc({ updatedAt: "2024-01-01T00:00:00.000Z" });
      localStorage.setItem("sync-base-document:backend", JSON.stringify(baseDoc));

      const localDoc = makeDoc({ updatedAt: "2024-03-01T00:00:00.000Z", data: { ...baseDoc.data, grade: "nidan" as const } });
      const remoteDoc = makeDoc({ updatedAt: "2024-06-01T00:00:00.000Z", data: { ...baseDoc.data, grade: "sandan" as const } });
      mockStore.getDocument.mockReturnValue(localDoc);
      mockBackendClient.downloadDocument.mockResolvedValue(remoteDoc);

      const manager = getSyncManager();
      const result = await manager.syncNow();

      expect(result.conflictDetected).toBe(true);
      expect(manager.getState().status).toBe("conflict_resolution");
      expect(mockBackendClient.uploadDocument).not.toHaveBeenCalled();
    });

    it("backs up local document to localStorage when conflict is detected", async () => {
      const baseDoc = makeDoc({ updatedAt: "2024-01-01T00:00:00.000Z" });
      localStorage.setItem("sync-base-document:backend", JSON.stringify(baseDoc));

      const localDoc = makeDoc({ updatedAt: "2024-03-01T00:00:00.000Z", data: { ...baseDoc.data, grade: "nidan" as const } });
      const remoteDoc = makeDoc({ updatedAt: "2024-06-01T00:00:00.000Z", data: { ...baseDoc.data, grade: "sandan" as const } });
      mockStore.getDocument.mockReturnValue(localDoc);
      mockBackendClient.downloadDocument.mockResolvedValue(remoteDoc);

      await getSyncManager().syncNow();

      const backupKeys = Object.keys(localStorage).filter(k => k.startsWith("sync-backup:backend:"));
      expect(backupKeys.length).toBeGreaterThan(0);
    });
  });

  // ─── disconnect ───────────────────────────────────────────────────────────

  describe("disconnect", () => {
    it("drops the backend session and reverts the provider to local", () => {
      getSyncManager().disconnect();
      expect(mockBackendClient.disconnect).toHaveBeenCalled();
      expect(mockStore.set).toHaveBeenCalledWith("syncProvider", "local");
    });
  });

  // ─── resolveConflict ──────────────────────────────────────────────────────

  describe("resolveConflict", () => {
    it("is a no-op when not in conflict_resolution state", async () => {
      const manager = getSyncManager();
      await manager.resolveConflict("local");
      expect(manager.getState().status).toBe("local_only");
    });

    async function enterConflict() {
      const baseDoc = makeDoc({ updatedAt: "2024-01-01T00:00:00.000Z" });
      localStorage.setItem("sync-base-document:backend", JSON.stringify(baseDoc));

      const localDoc = makeDoc({ updatedAt: "2024-03-01T00:00:00.000Z", data: { ...baseDoc.data, grade: "nidan" as const } });
      const remoteDoc = makeDoc({ updatedAt: "2024-06-01T00:00:00.000Z", data: { ...baseDoc.data, grade: "sandan" as const } });
      mockStore.getDocument.mockReturnValue(localDoc);
      mockBackendClient.downloadDocument.mockResolvedValue(remoteDoc);

      const manager = getSyncManager();
      await manager.syncNow();
      return { manager, localDoc, remoteDoc };
    }

    it("applies local doc and uploads when choice is 'local'", async () => {
      const { manager, localDoc } = await enterConflict();
      mockBackendClient.uploadDocument.mockClear();

      await manager.resolveConflict("local");

      expect(mockStore.setDocument).toHaveBeenCalledWith(localDoc);
      expect(mockBackendClient.uploadDocument).toHaveBeenCalledWith(localDoc);
      expect(manager.getState().status).toBe("connected");
    });

    it("applies remote doc and uploads when choice is 'remote'", async () => {
      const { manager, remoteDoc } = await enterConflict();
      mockBackendClient.uploadDocument.mockClear();

      await manager.resolveConflict("remote");

      expect(mockStore.setDocument).toHaveBeenCalledWith(remoteDoc);
      expect(mockBackendClient.uploadDocument).toHaveBeenCalledWith(remoteDoc);
      expect(manager.getState().status).toBe("connected");
    });

    it("records lastConflictResolutionAt after resolving", async () => {
      const { manager } = await enterConflict();
      await manager.resolveConflict("local");
      expect(manager.getState().lastConflictResolutionAt).not.toBeNull();
    });
  });

  // ─── error handling / retry ───────────────────────────────────────────────

  describe("retrySync / error handling", () => {
    it("sets error state when syncNow throws a transient error via retrySync", async () => {
      mockBackendClient.downloadDocument.mockRejectedValue(new Error("network failure"));
      mockStore.getDocument.mockReturnValue(makeDoc());

      const manager = getSyncManager();
      manager.retrySync();
      await flushPromises();

      expect(manager.getState().status).toBe("error");
      expect(manager.getState().message).toBe("network failure");
    });

    it("sets auth_expired state (not error) when AuthExpiredError is thrown", async () => {
      mockBackendClient.downloadDocument.mockRejectedValue(new AuthExpiredError());
      mockStore.getDocument.mockReturnValue(makeDoc());

      const manager = getSyncManager();
      manager.retrySync();
      await flushPromises();

      expect(manager.getState().status).toBe("auth_expired");
    });

    it("schedules a retry after a transient error", async () => {
      vi.useFakeTimers();

      mockBackendClient.downloadDocument
        .mockRejectedValueOnce(new Error("temp fail"))
        .mockResolvedValue(null);
      mockStore.getDocument.mockReturnValue(makeDoc());

      const manager = getSyncManager();
      manager.retrySync();
      await flushPromises();

      expect(manager.getState().status).toBe("error");

      // First retry delay is 10 000 ms.
      await vi.advanceTimersByTimeAsync(10_000);
      await flushPromises();

      expect(manager.getState().status).toBe("connected");
      vi.useRealTimers();
    });

    it("does not retry on AuthExpiredError", async () => {
      vi.useFakeTimers();

      mockBackendClient.downloadDocument.mockRejectedValue(new AuthExpiredError());
      mockStore.getDocument.mockReturnValue(makeDoc());

      const manager = getSyncManager();
      manager.retrySync();
      await flushPromises();

      expect(manager.getState().status).toBe("auth_expired");

      await vi.advanceTimersByTimeAsync(15_000);
      await flushPromises();

      // Should still be auth_expired — no retry scheduled.
      expect(mockBackendClient.downloadDocument).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  // ─── start() — provider handling ──────────────────────────────────────────

  describe("start", () => {
    it("calling start() twice is a no-op for the second call", async () => {
      mockStore.get.mockImplementation((k: string) => k === "syncProvider" ? "local" : undefined);
      const manager = getSyncManager();
      manager.start();
      manager.start();
      await flushPromises();
      // subscribeDocument called exactly once (inside start)
      expect(mockStore.subscribeDocument).toHaveBeenCalledTimes(1);
    });

    it("sets local_only state when signed out on start", async () => {
      mockStore.get.mockImplementation((k: string) => k === "syncProvider" ? "local" : undefined);
      const manager = getSyncManager();
      manager.start();
      await flushPromises();
      expect(manager.getState().status).toBe("local_only");
    });

    it("sets auth_expired state when client.wasAuthExpired() is true on start", async () => {
      mockBackendClient.isConnected.mockReturnValue(false);
      mockBackendClient.wasAuthExpired.mockReturnValue(true);

      const manager = getSyncManager();
      manager.start();
      await flushPromises();

      expect(manager.getState().status).toBe("auth_expired");
    });

    it("sets disconnected state when client is not connected and auth not expired", async () => {
      mockBackendClient.isConnected.mockReturnValue(false);
      mockBackendClient.wasAuthExpired.mockReturnValue(false);

      const manager = getSyncManager();
      manager.start();
      await flushPromises();

      expect(manager.getState().status).toBe("disconnected");
    });

    it("calls syncNow when client is connected after start", async () => {
      mockBackendClient.isConnected.mockReturnValue(true);
      mockBackendClient.downloadDocument.mockResolvedValue(null);
      mockStore.getDocument.mockReturnValue(makeDoc());

      const manager = getSyncManager();
      manager.start();
      await flushPromises();

      expect(mockBackendClient.downloadDocument).toHaveBeenCalled();
      expect(manager.getState().status).toBe("connected");
    });

    it("clears leftover cloud-storage sync data on start", async () => {
      localStorage.setItem("sync-onedrive-token", "{}");
      localStorage.setItem("sync-google-drive-token", "{}");
      localStorage.setItem("sync-base-document:onedrive", "{}");
      localStorage.setItem("sync-backup:google-drive:2024-01-01T00:00:00.000Z", "{}");
      localStorage.setItem("sync-base-document:backend", "{}");

      const manager = getSyncManager();
      manager.start();
      await flushPromises();

      expect(localStorage.getItem("sync-onedrive-token")).toBeNull();
      expect(localStorage.getItem("sync-google-drive-token")).toBeNull();
      expect(localStorage.getItem("sync-base-document:onedrive")).toBeNull();
      expect(localStorage.getItem("sync-backup:google-drive:2024-01-01T00:00:00.000Z")).toBeNull();
      // The backend's own base document must survive the purge.
      expect(localStorage.getItem("sync-base-document:backend")).not.toBeNull();
    });
  });
});
