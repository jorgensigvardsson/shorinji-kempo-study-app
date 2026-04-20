import { getAppDataStore } from "../persistence/store";
import type { AppDataDocument, SyncProvider } from "../persistence/schema";
import { mergeDocuments } from "./merge";
import { OneDriveClient } from "./onedrive";
import type { SyncResult, SyncState } from "./types";

type SyncStateListener = (state: SyncState) => void;
type Unsubscribe = () => void;

const baseDocumentStoragePrefix = "sync-base-document:";
const backupStoragePrefix = "sync-backup:";

class SyncManager {
  private readonly store = getAppDataStore();
  private readonly oneDriveClient = new OneDriveClient();
  private state: SyncState = {
    status: "local_only",
    message: null,
    lastSyncedAt: null,
    lastConflictResolutionAt: null,
  };
  private readonly listeners = new Map<number, SyncStateListener>();
  private nextListenerId = 0;
  private started = false;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private isApplyingRemoteDocument = false;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.store.subscribe("syncProvider", () => {
      this.handleProviderChanged().catch(error => {
        this.setState({ status: "error", message: formatError(error) });
      });
    });

    this.store.subscribeDocument(() => {
      if (this.isApplyingRemoteDocument) {
        return;
      }
      this.scheduleBackgroundSync();
    });

    this.handleProviderChanged().catch(error => {
      this.setState({ status: "error", message: formatError(error) });
    });
  }

  getState(): SyncState {
    return { ...this.state };
  }

  subscribe(listener: SyncStateListener): Unsubscribe {
    const id = this.nextListenerId++;
    this.listeners.set(id, listener);
    return () => {
      this.listeners.delete(id);
    };
  }

  async connect(): Promise<void> {
    const provider = this.store.get("syncProvider");
    if (provider !== "onedrive") {
      this.setState({
        status: "disconnected",
        message: "Connect is only available for OneDrive right now.",
      });
      return;
    }

    if (!this.oneDriveClient.canUse()) {
      this.setState({
        status: "error",
        message: "Set VITE_ONEDRIVE_CLIENT_ID to enable OneDrive sync.",
      });
      return;
    }

    this.setState({ status: "connecting", message: "Connecting to OneDrive..." });
    await this.oneDriveClient.beginAuthorization();
  }

  disconnect(): void {
    const provider = this.store.get("syncProvider");
    if (provider === "onedrive") {
      this.oneDriveClient.disconnect();
    }

    this.setState({
      status: provider === "local" ? "local_only" : "disconnected",
      message: provider === "local" ? null : "Disconnected.",
    });
  }

  async syncNow(): Promise<SyncResult> {
    const provider = this.store.get("syncProvider");
    if (provider === "local") {
      this.setState({ status: "local_only", message: null });
      return { conflictDetected: false, pushedLocalChanges: false };
    }

    if (provider !== "onedrive") {
      this.setState({
        status: "disconnected",
        message: "This provider is not implemented yet.",
      });
      return { conflictDetected: false, pushedLocalChanges: false };
    }

    if (!this.oneDriveClient.isConnected()) {
      this.setState({ status: "disconnected", message: "Please connect to OneDrive first." });
      return { conflictDetected: false, pushedLocalChanges: false };
    }

    this.setState({ status: "syncing", message: "Synchronizing..." });
    const localDocument = this.store.getDocument();
    const remoteDocument = await this.oneDriveClient.downloadDocument();

    if (!remoteDocument) {
      await this.oneDriveClient.uploadDocument(localDocument);
      this.saveBaseDocument(provider, localDocument);
      this.setState({
        status: "connected",
        message: "Synced to OneDrive.",
        lastSyncedAt: new Date().toISOString(),
      });
      return { conflictDetected: false, pushedLocalChanges: true };
    }

    const baseDocument = this.readBaseDocument(provider);
    const mergeResult = mergeDocuments(baseDocument, localDocument, remoteDocument);
    const mergedDocument = mergeResult.document;

    const mergedDiffersFromLocal = !areEqual(localDocument, mergedDocument);
    const mergedDiffersFromRemote = !areEqual(remoteDocument, mergedDocument);
    if (mergeResult.conflictDetected) {
      this.backupDocument(localDocument, provider);
    }

    if (mergedDiffersFromLocal) {
      this.isApplyingRemoteDocument = true;
      this.store.setDocument(mergedDocument);
      this.isApplyingRemoteDocument = false;
    }

    if (mergedDiffersFromRemote) {
      await this.oneDriveClient.uploadDocument(mergedDocument);
    }

    this.saveBaseDocument(provider, mergedDocument);
    this.setState({
      status: "connected",
      message: mergeResult.conflictDetected
        ? "Synced with conflict resolution."
        : "Synced.",
      lastSyncedAt: new Date().toISOString(),
      lastConflictResolutionAt: mergeResult.conflictDetected
        ? new Date().toISOString()
        : this.state.lastConflictResolutionAt,
    });

    return {
      conflictDetected: mergeResult.conflictDetected,
      pushedLocalChanges: mergedDiffersFromRemote,
    };
  }

  private async handleProviderChanged(): Promise<void> {
    const provider = this.store.get("syncProvider");
    if (provider === "local") {
      this.clearScheduledSync();
      this.setState({
        status: "local_only",
        message: "Using local storage only.",
      });
      return;
    }

    if (provider !== "onedrive") {
      this.clearScheduledSync();
      this.setState({
        status: "disconnected",
        message: "This provider is not implemented yet.",
      });
      return;
    }

    if (!this.oneDriveClient.canUse()) {
      this.setState({
        status: "error",
        message: "Set VITE_ONEDRIVE_CLIENT_ID to enable OneDrive sync.",
      });
      return;
    }

    const authCompleted = await this.oneDriveClient.completeAuthorizationIfPresent();
    if (!this.oneDriveClient.isConnected()) {
      this.setState({
        status: "disconnected",
        message: authCompleted ? "Connected callback handled. Please connect again." : "Not connected.",
      });
      return;
    }

    this.setState({ status: "connected", message: "Connected to OneDrive." });
    await this.syncNow();
  }

  private scheduleBackgroundSync(): void {
    const provider = this.store.get("syncProvider");
    if (provider === "local" || this.state.status === "error" || this.state.status === "connecting") {
      return;
    }

    this.clearScheduledSync();
    this.syncTimer = setTimeout(() => {
      this.syncNow().catch(error => {
        this.setState({
          status: "error",
          message: formatError(error),
        });
      });
    }, 2500);
  }

  private clearScheduledSync(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private saveBaseDocument(provider: SyncProvider, document: AppDataDocument): void {
    localStorage.setItem(`${baseDocumentStoragePrefix}${provider}`, JSON.stringify(document));
  }

  private readBaseDocument(provider: SyncProvider): AppDataDocument | null {
    const raw = localStorage.getItem(`${baseDocumentStoragePrefix}${provider}`);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as AppDataDocument;
    } catch {
      return null;
    }
  }

  private backupDocument(document: AppDataDocument, provider: SyncProvider): void {
    const key = `${backupStoragePrefix}${provider}:${new Date().toISOString()}`;
    localStorage.setItem(key, JSON.stringify(document));
  }

  private setState(update: Partial<SyncState>): void {
    this.state = {
      ...this.state,
      ...update,
    };

    const snapshot = this.getState();
    for (const listener of this.listeners.values()) {
      listener(snapshot);
    }
  }
}

let syncManager: SyncManager | null = null;

export function getSyncManager(): SyncManager {
  if (!syncManager) {
    syncManager = new SyncManager();
  }

  return syncManager;
}

function areEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected sync error.";
}
