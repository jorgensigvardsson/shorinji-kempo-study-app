import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDataDocument, AppDataState } from "../persistence/schema";
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
  getUserInfo: ReturnType<typeof vi.fn>;
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
    getUserInfo: vi.fn().mockReturnValue({ id: "user-1", email: "malin@example.org" }),
    isConnected: vi.fn().mockReturnValue(true),
    wasAuthExpired: vi.fn().mockReturnValue(false),
    disconnect: vi.fn(),
    downloadDocument: vi.fn().mockResolvedValue(null),
    uploadDocument: vi.fn().mockResolvedValue(nextEtag()),
  };
}

// downloadDocument hands back the document together with the ETag naming that exact
// stored version, which the upload then quotes as its precondition.
function stored(document: AppDataDocument, etag = "etag-remote") {
  return { document, etag };
}

let etagCounter = 0;
function nextEtag() {
  return `etag-${++etagCounter}`;
}

type MockStore = {
  get: ReturnType<typeof vi.fn>;
  getDocument: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  setDocument: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  subscribeDocument: ReturnType<typeof vi.fn>;
  bindToAccount: ReturnType<typeof vi.fn>;
};

function makeMockStore(doc?: AppDataDocument): MockStore {
  const localDoc = doc ?? makeDoc();
  return {
    get: vi.fn((key: string) => localDoc.data[key as keyof AppDataState]),
    getDocument: vi.fn(() => ({ ...localDoc })),
    set: vi.fn(),
    setDocument: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
    subscribeDocument: vi.fn().mockReturnValue(() => {}),
    bindToAccount: vi.fn().mockReturnValue("claimed"),
  };
}

// ─── test suite ───────────────────────────────────────────────────────────────

describe("SyncManager", () => {
  let mockBackendClient: MockClient;
  let mockStore: MockStore;
  let getSyncManager: typeof import("./manager").getSyncManager;
  // Dynamically imported after vi.resetModules() so instanceof checks match the fresh module.
  let AuthExpiredError: typeof import("./types").AuthExpiredError;
  let DocumentChangedError: typeof import("./types").DocumentChangedError;
  let ClientOutdatedError: typeof import("./types").ClientOutdatedError;
  let DocumentTooLargeError: typeof import("./types").DocumentTooLargeError;

  beforeEach(async () => {
    localStorage.clear();
    // Signed in unless a test says otherwise. Device-local now, so it is set here
    // rather than through the store mock.
    localStorage.setItem("sync-provider", "backend");
    mockBackendClient = makeMockClient();
    mockStore = makeMockStore();

    vi.resetModules();
    // A regular function (not an arrow function) is required here — arrow functions cannot
    // be used as constructors, and SyncManager instantiates this with `new`.
    vi.doMock("./backend", () => ({ BackendSyncClient: function() { return mockBackendClient; } }));
    vi.doMock("../persistence/store", () => ({ getAppDataStore: function() { return mockStore; } }));

    ({ getSyncManager } = await import("./manager"));
    ({ AuthExpiredError, DocumentChangedError, ClientOutdatedError, DocumentTooLargeError } = await import("./types"));
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
      localStorage.setItem("sync-provider", "local");
      const manager = getSyncManager();
      const received: string[] = [];
      manager.subscribe(s => received.push(s.status));
      await manager.syncNow();
      expect(received).toContain("local_only");
    });

    it("unsubscribe stops receiving state updates", async () => {
      localStorage.setItem("sync-provider", "local");
      const manager = getSyncManager();
      const cb = vi.fn();
      const unsub = manager.subscribe(cb);
      unsub();
      await manager.syncNow();
      expect(cb).not.toHaveBeenCalled();
    });

    it("multiple subscribers all receive the same update", async () => {
      localStorage.setItem("sync-provider", "local");
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
      localStorage.setItem("sync-provider", "local");
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

    it("does not sync until the signed-in account can be identified", async () => {
      mockBackendClient.getUserInfo.mockReturnValue(null);

      const result = await getSyncManager().syncNow();

      expect(result.pushedLocalChanges).toBe(false);
      expect(mockStore.bindToAccount).not.toHaveBeenCalled();
      expect(mockBackendClient.downloadDocument).not.toHaveBeenCalled();
      expect(getSyncManager().getState().status).toBe("disconnected");
    });

    it("uploads local doc as initial when no remote document exists", async () => {
      const localDoc = makeDoc({ updatedAt: "2024-06-01T00:00:00.000Z" });
      mockStore.getDocument.mockReturnValue(localDoc);
      mockBackendClient.downloadDocument.mockResolvedValue(null);

      const manager = getSyncManager();
      const result = await manager.syncNow();

      // No ETag: this upload claims to be creating the first document.
      expect(mockBackendClient.uploadDocument).toHaveBeenCalledWith(localDoc, null, "user-1");
      expect(mockBackendClient.downloadDocument).toHaveBeenCalledWith("user-1");
      expect(result.pushedLocalChanges).toBe(true);
      expect(result.conflictDetected).toBe(false);
      expect(manager.getState().status).toBe("connected");
    });

    it("saves base document to localStorage after initial upload", async () => {
      mockStore.getDocument.mockReturnValue(makeDoc());
      mockBackendClient.downloadDocument.mockResolvedValue(null);

      await getSyncManager().syncNow();

      expect(
        localStorage.getItem("sync-base-document:backend:account:malin%40example.org"),
      ).not.toBeNull();
    });

    it("keeps this tab's merge base when another tab advances its stored base", async () => {
      const baseDoc = makeDoc({ updatedAt: "2024-01-01T00:00:00.000Z" });
      localStorage.setItem("sync-base-document:backend", JSON.stringify(baseDoc));
      mockStore.getDocument.mockReturnValue(baseDoc);
      mockBackendClient.downloadDocument.mockResolvedValue(stored(baseDoc));

      const manager = getSyncManager();
      await manager.syncNow();

      const remoteDoc = makeDoc({
        updatedAt: "2024-06-01T00:00:00.000Z",
        data: { ...baseDoc.data, kenshiNumber: "0123456789" },
      });
      // Another tab has synced the new number and updated the shared persisted
      // base. This running tab must still compare against its own earlier base.
      localStorage.setItem(
        "sync-base-document:backend:account:malin%40example.org",
        JSON.stringify(remoteDoc),
      );
      mockBackendClient.downloadDocument.mockResolvedValue(stored(remoteDoc));
      mockStore.setDocument.mockClear();
      mockBackendClient.uploadDocument.mockClear();

      await manager.syncNow();

      const applied = mockStore.setDocument.mock.calls[0][0] as AppDataDocument;
      expect(applied.data.kenshiNumber).toBe("0123456789");
      expect(mockBackendClient.uploadDocument).not.toHaveBeenCalled();
    });

    it("applies remote changes to local store when remote is newer", async () => {
      const localDoc = makeDoc({ updatedAt: "2024-01-01T00:00:00.000Z" });
      const remoteDoc = makeDoc({
        updatedAt: "2024-06-01T00:00:00.000Z",
        data: { ...localDoc.data, grade: "nidan" as const },
      });
      mockStore.getDocument.mockReturnValue(localDoc);
      mockBackendClient.downloadDocument.mockResolvedValue(stored(remoteDoc));

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
      mockBackendClient.downloadDocument.mockResolvedValue(stored(remoteDoc));

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
      mockBackendClient.downloadDocument.mockResolvedValue(stored(uploaded));
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
      mockBackendClient.downloadDocument.mockResolvedValue(stored(remoteDoc));

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
      mockBackendClient.downloadDocument.mockResolvedValue(stored(remoteDoc));

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
      expect(localStorage.getItem("sync-provider")).toBe("local");
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
      mockBackendClient.downloadDocument.mockResolvedValue(stored(remoteDoc));

      const manager = getSyncManager();
      await manager.syncNow();
      return { manager, localDoc, remoteDoc };
    }

    it("applies local doc and uploads when choice is 'local'", async () => {
      const { manager, localDoc, remoteDoc } = await enterConflict();
      mockBackendClient.uploadDocument.mockClear();

      await manager.resolveConflict("local");

      const resolved = mockStore.setDocument.mock.calls[0][0] as AppDataDocument;
      expect(resolved.data.grade).toBe(localDoc.data.grade);
      expect(resolved.updatedAt).toBe(remoteDoc.updatedAt);
      // Resolving quotes the version the conflict was read from, so a device that
      // wrote while the prompt was open is not overwritten by the answer.
      expect(mockBackendClient.uploadDocument).toHaveBeenCalledWith(resolved, "etag-remote", "user-1");
      expect(manager.getState().status).toBe("connected");
    });

    it("applies remote doc and uploads when choice is 'remote'", async () => {
      const { manager, remoteDoc } = await enterConflict();
      mockBackendClient.uploadDocument.mockClear();

      await manager.resolveConflict("remote");

      expect(mockStore.setDocument).toHaveBeenCalledWith(remoteDoc);
      expect(mockBackendClient.uploadDocument).toHaveBeenCalledWith(remoteDoc, "etag-remote", "user-1");
      expect(manager.getState().status).toBe("connected");
    });

    it("keeps independent remote data and edits made while the prompt is open", async () => {
      const baseDoc = makeDoc({ updatedAt: "2024-01-01T00:00:00.000Z" });
      const localDoc = makeDoc({
        updatedAt: "2024-03-01T00:00:00.000Z",
        data: { ...baseDoc.data, grade: "nidan" as const },
      });
      const remoteDoc = makeDoc({
        updatedAt: "2024-06-01T00:00:00.000Z",
        data: {
          ...baseDoc.data,
          grade: "sandan" as const,
          kenshiNumber: "0123456789",
        },
      });
      let currentDocument = localDoc;
      localStorage.setItem("sync-base-document:backend", JSON.stringify(baseDoc));
      mockStore.getDocument.mockImplementation(() => currentDocument);
      mockBackendClient.downloadDocument.mockResolvedValue(stored(remoteDoc));

      const manager = getSyncManager();
      await manager.syncNow();

      currentDocument = {
        ...localDoc,
        updatedAt: "2024-07-01T00:00:00.000Z",
        data: { ...localDoc.data, language: "tr" as const },
      };
      await manager.resolveConflict("local");

      const chosen = mockStore.setDocument.mock.calls[0][0] as AppDataDocument;
      expect(chosen.data.grade).toBe("nidan");
      expect(chosen.data.kenshiNumber).toBe("0123456789");
      expect(chosen.data.language).toBe("tr");
      expect(mockBackendClient.uploadDocument).toHaveBeenCalledWith(chosen, "etag-remote", "user-1");
    });

    it("records lastConflictResolutionAt after resolving", async () => {
      const { manager } = await enterConflict();
      await manager.resolveConflict("local");
      expect(manager.getState().lastConflictResolutionAt).not.toBeNull();
    });
  });

  // ─── optimistic concurrency ───────────────────────────────────────────────

  describe("stale uploads", () => {
    // Local is ahead of remote, so the merge is uploaded — the case a competing
    // device can invalidate between our read and our write.
    function aheadOfRemote() {
      const remoteDoc = makeDoc({ updatedAt: "2024-01-01T00:00:00.000Z" });
      const localDoc = makeDoc({
        updatedAt: "2024-06-01T00:00:00.000Z",
        data: { ...remoteDoc.data, grade: "sandan" as const },
      });
      mockStore.getDocument.mockReturnValue(localDoc);
      mockBackendClient.downloadDocument.mockResolvedValue(stored(remoteDoc));
      return { localDoc, remoteDoc };
    }

    it("re-reads and merges again when the server rejects the upload as stale", async () => {
      aheadOfRemote();
      mockBackendClient.uploadDocument
        .mockRejectedValueOnce(new DocumentChangedError())
        .mockResolvedValue("etag-new");

      const manager = getSyncManager();
      const result = await manager.syncNow();

      // Rejected once, so the whole read/merge/write ran a second time.
      expect(mockBackendClient.downloadDocument).toHaveBeenCalledTimes(2);
      expect(mockBackendClient.uploadDocument).toHaveBeenCalledTimes(2);
      expect(manager.getState().status).toBe("connected");
      expect(result.pushedLocalChanges).toBe(true);
    });

    it("sends the ETag of the version it merged from", async () => {
      aheadOfRemote();
      mockBackendClient.downloadDocument.mockResolvedValue(
        stored(makeDoc({ updatedAt: "2024-01-01T00:00:00.000Z" }), "etag-v7"),
      );

      await getSyncManager().syncNow();

      expect(mockBackendClient.uploadDocument.mock.calls[0][1]).toBe("etag-v7");
    });

    it("stops retrying stale uploads and surfaces the failure", async () => {
      aheadOfRemote();
      mockBackendClient.uploadDocument.mockRejectedValue(new DocumentChangedError());

      // retrySync is how the app calls in — it routes a rejection to the error state.
      const manager = getSyncManager();
      manager.retrySync();
      await flushPromises();

      // Four attempts: the first plus MAX_STALE_RETRIES.
      expect(mockBackendClient.uploadDocument).toHaveBeenCalledTimes(4);
      // It gave up rather than looping, and did not pretend to have succeeded.
      // Whether the user is told is a separate question with its own tests: a
      // first failure is held quiet for the retry, since it is usually a service
      // waking up rather than a fault.
      expect(manager.getState().status).not.toBe("connected");
    });

    it("does not apply a merge the server refused", async () => {
      aheadOfRemote();
      mockBackendClient.uploadDocument.mockRejectedValue(new DocumentChangedError());

      await getSyncManager().syncNow().catch(() => {});
      await flushPromises();

      // Leaving the refused merge in the local store would make this device believe
      // it holds a version the server never accepted.
      expect(mockStore.setDocument).not.toHaveBeenCalled();
      expect(localStorage.getItem("sync-base-document:backend")).toBeNull();
    });
  });

  // ─── outdated client ──────────────────────────────────────────────────────

  describe("client too old for the stored schema", () => {
    function rejectingServer() {
      const remoteDoc = makeDoc({ updatedAt: "2024-01-01T00:00:00.000Z" });
      const localDoc = makeDoc({
        updatedAt: "2024-06-01T00:00:00.000Z",
        data: { ...remoteDoc.data, grade: "sandan" as const },
      });
      mockStore.getDocument.mockReturnValue(localDoc);
      mockBackendClient.downloadDocument.mockResolvedValue(stored(remoteDoc));
      mockBackendClient.uploadDocument.mockRejectedValue(new ClientOutdatedError(2));
    }

    it("stops syncing rather than retrying a write that cannot succeed", async () => {
      rejectingServer();

      const manager = getSyncManager();
      manager.retrySync();
      await flushPromises();

      expect(manager.getState().status).toBe("client_outdated");
      // One attempt, not the four a stale write would make.
      expect(mockBackendClient.uploadDocument).toHaveBeenCalledTimes(1);
    });

    it("schedules no retry, because only updating the app can help", async () => {
      vi.useFakeTimers();
      rejectingServer();

      const manager = getSyncManager();
      manager.retrySync();
      await flushPromises();

      await vi.advanceTimersByTimeAsync(120_000);
      await flushPromises();

      expect(manager.getState().status).toBe("client_outdated");
      expect(mockBackendClient.downloadDocument).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it("does not apply the refused document locally", async () => {
      rejectingServer();

      getSyncManager().retrySync();
      await flushPromises();

      expect(mockStore.setDocument).not.toHaveBeenCalled();
    });
  });

  // ─── document over the size limit ──────────────────────────────────────────

  describe("document too large for the server", () => {
    function rejectingServer() {
      const remoteDoc = makeDoc({ updatedAt: "2024-01-01T00:00:00.000Z" });
      const localDoc = makeDoc({
        updatedAt: "2024-06-01T00:00:00.000Z",
        data: { ...remoteDoc.data, grade: "sandan" as const },
      });
      mockStore.getDocument.mockReturnValue(localDoc);
      mockBackendClient.downloadDocument.mockResolvedValue(stored(remoteDoc));
      mockBackendClient.uploadDocument.mockRejectedValue(new DocumentTooLargeError(1_400_000, 1 << 20));
    }

    it("stops rather than retrying an upload the server will always refuse", async () => {
      rejectingServer();

      const manager = getSyncManager();
      manager.retrySync();
      await flushPromises();

      expect(manager.getState().status).toBe("document_too_large");
      // One attempt. Three more megabyte uploads would help nobody.
      expect(mockBackendClient.uploadDocument).toHaveBeenCalledTimes(1);
    });

    it("schedules no retry, because nothing that happens on its own makes it smaller", async () => {
      vi.useFakeTimers();
      rejectingServer();

      const manager = getSyncManager();
      manager.retrySync();
      await flushPromises();

      await vi.advanceTimersByTimeAsync(120_000);
      await flushPromises();

      expect(manager.getState().status).toBe("document_too_large");
      expect(mockBackendClient.downloadDocument).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    // The local document is the one that is too big, and it is also the only copy of
    // the user's most recent work. Refusing to sync it must not discard it.
    it("leaves the local document alone", async () => {
      rejectingServer();

      getSyncManager().retrySync();
      await flushPromises();

      expect(mockStore.setDocument).not.toHaveBeenCalled();
    });

    it("reports how far over the limit it is", async () => {
      rejectingServer();

      getSyncManager().retrySync();
      await flushPromises();

      const error = getSyncManager().getState().error;
      expect(error).toBeInstanceOf(DocumentTooLargeError);
      expect((error as InstanceType<typeof DocumentTooLargeError>).bytes).toBe(1_400_000);
      expect((error as InstanceType<typeof DocumentTooLargeError>).limitBytes).toBe(1 << 20);
    });
  });

  // ─── concurrent syncs ─────────────────────────────────────────────────────

  describe("overlapping syncNow calls", () => {
    it("joins an in-flight sync instead of starting a second one", async () => {
      let releaseDownload: (value: unknown) => void = () => {};
      mockBackendClient.downloadDocument.mockReturnValue(
        new Promise(resolve => { releaseDownload = resolve; }),
      );
      mockStore.getDocument.mockReturnValue(makeDoc());

      const manager = getSyncManager();
      const first = manager.syncNow();
      const second = manager.syncNow();
      const third = manager.syncNow();

      releaseDownload(null);
      const results = await Promise.all([first, second, third]);

      // One download, one upload — not three racing read/merge/write cycles.
      expect(mockBackendClient.downloadDocument).toHaveBeenCalledTimes(1);
      expect(mockBackendClient.uploadDocument).toHaveBeenCalledTimes(1);
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    });

    it("runs another pass afterwards, so changes made mid-sync are not stranded", async () => {
      vi.useFakeTimers();
      let releaseDownload: (value: unknown) => void = () => {};
      mockBackendClient.downloadDocument.mockReturnValueOnce(
        new Promise(resolve => { releaseDownload = resolve; }),
      ).mockResolvedValue(null);
      mockStore.getDocument.mockReturnValue(makeDoc());

      const manager = getSyncManager();
      const first = manager.syncNow();
      void manager.syncNow(); // arrives while the first is still downloading

      releaseDownload(null);
      await first;
      await flushPromises();

      // The joined request is honoured through the normal debounce.
      await vi.advanceTimersByTimeAsync(2500);
      await flushPromises();

      expect(mockBackendClient.downloadDocument).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });

  describe("edits made during upload", () => {
    it("does not replace a newer local edit with the earlier merged document", async () => {
      vi.useFakeTimers();
      const baseDoc = makeDoc({ updatedAt: "2024-01-01T00:00:00.000Z" });
      const localDoc = makeDoc({
        updatedAt: "2024-03-01T00:00:00.000Z",
        data: { ...baseDoc.data, grade: "nidan" as const },
      });
      const remoteDoc = makeDoc({
        updatedAt: "2024-06-01T00:00:00.000Z",
        data: { ...baseDoc.data, kenshiNumber: "0123456789" },
      });
      let currentDocument = localDoc;
      localStorage.setItem("sync-base-document:backend", JSON.stringify(baseDoc));
      mockStore.getDocument.mockImplementation(() => currentDocument);
      mockBackendClient.downloadDocument.mockResolvedValue(stored(remoteDoc));

      let releaseUpload: () => void = () => {};
      mockBackendClient.uploadDocument.mockReturnValue(
        new Promise<string>(resolve => {
          releaseUpload = () => resolve("etag-uploaded");
        }),
      );

      const manager = getSyncManager();
      const sync = manager.syncNow();
      await flushPromises();
      expect(mockBackendClient.uploadDocument).toHaveBeenCalledOnce();

      currentDocument = {
        ...localDoc,
        updatedAt: "2024-07-01T00:00:00.000Z",
        data: { ...localDoc.data, language: "tr" as const },
      };
      releaseUpload();
      await sync;

      expect(mockStore.setDocument).not.toHaveBeenCalled();

      // The later edit is picked up by the queued follow-up pass.
      await vi.advanceTimersByTimeAsync(2500);
      await flushPromises();
      expect(mockBackendClient.downloadDocument).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });

  // ─── error handling / retry ───────────────────────────────────────────────

  describe("retrySync / error handling", () => {
    // Returning to the app after a while means waking two scaled-to-zero services,
    // or a phone whose radio has not finished reconnecting. Both look like this and
    // both fix themselves, so the first failure is not worth alarming anybody with
    // — the retry is already scheduled.
    it("says nothing on the first transient failure", async () => {
      vi.useFakeTimers();
      mockBackendClient.downloadDocument.mockRejectedValue(new Error("network failure"));
      mockStore.getDocument.mockReturnValue(makeDoc());

      const manager = getSyncManager();
      manager.retrySync();
      await flushPromises();

      expect(manager.getState().status).not.toBe("error");
      vi.useRealTimers();
    });

    it("surfaces the failure once a retry has failed too", async () => {
      vi.useFakeTimers();
      mockBackendClient.downloadDocument.mockRejectedValue(new Error("network failure"));
      mockStore.getDocument.mockReturnValue(makeDoc());

      const manager = getSyncManager();
      manager.retrySync();
      await flushPromises();

      // The first retry falls due after 10 s, and fails as well: by now this is a
      // fault rather than a cold start, and worth telling somebody about.
      await vi.advanceTimersByTimeAsync(10_000);
      await flushPromises();

      expect(manager.getState().status).toBe("error");
      expect(manager.getState().message).toBe("network failure");
      vi.useRealTimers();
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

      // Quiet so far: a retry is scheduled and the user is told nothing.
      expect(manager.getState().status).not.toBe("error");

      // First retry delay is 10 000 ms.
      await vi.advanceTimersByTimeAsync(10_000);
      await flushPromises();

      // ...and it worked, so there was never anything to report.
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
      localStorage.setItem("sync-provider", "local");
      const manager = getSyncManager();
      manager.start();
      manager.start();
      await flushPromises();
      // subscribeDocument called exactly once (inside start)
      expect(mockStore.subscribeDocument).toHaveBeenCalledTimes(1);
    });

    // visibilitychange fires as the app comes to the foreground, which on a phone
    // is a moment before the radio has finished reconnecting. Firing a request
    // into that gap fails at once, and the first thing somebody sees on opening
    // the app is a warning about it.
    it("does not sync on returning to the app while offline", async () => {
      const manager = getSyncManager();
      manager.start();
      await flushPromises();
      mockBackendClient.downloadDocument.mockClear();

      Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
      await flushPromises();

      expect(mockBackendClient.downloadDocument).not.toHaveBeenCalled();
      Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    });

    // ...and the connection coming back is the one moment where trying again is
    // certain to be worth it, rather than waiting out a retry delay.
    it("syncs as soon as the connection returns", async () => {
      const manager = getSyncManager();
      manager.start();
      await flushPromises();
      mockBackendClient.downloadDocument.mockClear();

      window.dispatchEvent(new Event("online"));
      await flushPromises();

      expect(mockBackendClient.downloadDocument).toHaveBeenCalled();
    });

    it("sets local_only state when signed out on start", async () => {
      localStorage.setItem("sync-provider", "local");
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
      // The backend's own base document is migrated to the signed-in account.
      expect(localStorage.getItem("sync-base-document:backend")).toBeNull();
      expect(
        localStorage.getItem("sync-base-document:backend:account:malin%40example.org"),
      ).not.toBeNull();
    });
  });
});
