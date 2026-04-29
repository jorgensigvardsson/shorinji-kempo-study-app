import { getAppDataStore } from "../persistence/store";
import type { AppDataDocument, SyncProvider } from "../persistence/schema";
import { mergeDocuments } from "./merge";
import { GoogleDriveClient } from "./google-drive";
import { OneDriveClient } from "./onedrive";
import { AuthExpiredError, type SyncResult, type SyncState } from "./types";

const debug = import.meta.env.VITE_DEBUG === "true";
const debugLog = (...args: unknown[]) => { if (debug) console.log(...args); };
const debugWarn = (...args: unknown[]) => { if (debug) console.warn(...args); };

type SyncStateListener = (state: SyncState) => void;
type Unsubscribe = () => void;

const baseDocumentStoragePrefix = "sync-base-document:";
const backupStoragePrefix = "sync-backup:";

class SyncManager {
  private readonly store = getAppDataStore();
  private readonly oneDriveClient = new OneDriveClient();
  private readonly googleDriveClient = new GoogleDriveClient();
  private state: SyncState = {
    status: "local_only",
    message: null,
    error: null,
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
      this.handleProviderChanged().catch(error => this.handleSyncError(error));
    });

    this.store.subscribeDocument(() => {
      if (this.isApplyingRemoteDocument) {
        return;
      }
      this.scheduleBackgroundSync();
    });

    this.handleProviderChanged().catch(error => this.handleSyncError(error));
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
    const client = this.cloudClient(provider);
    if (!client) {
      this.setState({
        status: "disconnected",
        message: "Den här leverantören är inte implementerad än.",
      });
      return;
    }

    if (!client.canUse()) {
      this.setState({
        status: "error",
        message: provider === "onedrive"
          ? "Sätt VITE_ONEDRIVE_CLIENT_ID för att aktivera synk med OneDrive."
          : "Sätt VITE_GOOGLE_CLIENT_ID för att aktivera synk med Google Drive.",
      });
      return;
    }

    this.setState({
      status: "connecting",
      message: provider === "onedrive" ? "Ansluter till OneDrive..." : "Ansluter till Google Drive...",
    });
    await client.beginAuthorization();
  }

  disconnect(): void {
    const provider = this.store.get("syncProvider");
    const client = this.cloudClient(provider);
    if (client) {
      client.disconnect();
    }

    this.setState({
      status: provider === "local" ? "local_only" : "disconnected",
      message: provider === "local" ? null : "Frånkopplad.",
    });
  }

  async syncNow(): Promise<SyncResult> {
    const provider = this.store.get("syncProvider");
    if (provider === "local") {
      this.setState({ status: "local_only", message: null });
      return { conflictDetected: false, pushedLocalChanges: false };
    }

    const client = this.cloudClient(provider);
    if (!client) {
      this.setState({
        status: "disconnected",
        message: "Den här leverantören är inte implementerad än.",
      });
      return { conflictDetected: false, pushedLocalChanges: false };
    }

    if (!client.isConnected()) {
      debugWarn(`[sync] syncNow() called but client is not connected (provider: ${provider}). Token missing?`);
      this.setState({
        status: "disconnected",
        message: provider === "onedrive"
          ? "Anslut till OneDrive först."
          : "Anslut till Google Drive först.",
      });
      return { conflictDetected: false, pushedLocalChanges: false };
    }

    this.setState({ status: "syncing", message: "Synkar..." });
    const localDocument = this.store.getDocument();
    debugLog(`[sync] Starting sync with ${provider}. Local updatedAt: ${localDocument.updatedAt}`);

    const remoteDocument = await client.downloadDocument();

    if (!remoteDocument) {
      debugLog("[sync] No remote document found — uploading local as initial.");
      await client.uploadDocument(localDocument);
      this.saveBaseDocument(provider, localDocument);
      this.setState({
        status: "connected",
        message: provider === "onedrive" ? "Synkad med OneDrive." : "Synkad med Google Drive.",
        lastSyncedAt: new Date().toISOString(),
      });
      debugLog("[sync] Initial upload complete.");
      return { conflictDetected: false, pushedLocalChanges: true };
    }

    debugLog(`[sync] Remote document found. Remote updatedAt: ${remoteDocument.updatedAt}`);

    const baseDocument = this.readBaseDocument(provider);
    const mergeResult = mergeDocuments(baseDocument, localDocument, remoteDocument);
    const mergedDocument = mergeResult.document;

    const mergedDiffersFromLocal = !areEqual(localDocument, mergedDocument);
    const mergedDiffersFromRemote = !areEqual(remoteDocument, mergedDocument);

    debugLog(`[sync] Merge result — conflictDetected: ${mergeResult.conflictDetected}, applyingRemoteChanges: ${mergedDiffersFromLocal}, uploadingToRemote: ${mergedDiffersFromRemote}`);

    if (mergeResult.conflictDetected) {
      debugWarn("[sync] Conflict detected — local backup saved before overwrite.");
      this.backupDocument(localDocument, provider);
    }

    if (mergedDiffersFromLocal) {
      this.isApplyingRemoteDocument = true;
      this.store.setDocument(mergedDocument);
      this.isApplyingRemoteDocument = false;
      debugLog("[sync] Applied remote changes to local store.");
    }

    if (mergedDiffersFromRemote) {
      await client.uploadDocument(mergedDocument);
      debugLog("[sync] Uploaded merged document to remote.");
    }

    this.saveBaseDocument(provider, mergedDocument);
    this.setState({
      status: "connected",
      message: mergeResult.conflictDetected
        ? "Synkad med konfliktlösning."
        : "Synkad.",
      lastSyncedAt: new Date().toISOString(),
      lastConflictResolutionAt: mergeResult.conflictDetected
        ? new Date().toISOString()
        : this.state.lastConflictResolutionAt,
    });

    debugLog(`[sync] Sync complete. ${mergeResult.conflictDetected ? "⚠️ Conflicts were resolved." : "No conflicts."}`);

    return {
      conflictDetected: mergeResult.conflictDetected,
      pushedLocalChanges: mergedDiffersFromRemote,
    };
  }

  private async handleProviderChanged(): Promise<void> {
    const provider = this.store.get("syncProvider");
    debugLog(`[sync] handleProviderChanged: provider=${provider}`);

    if (provider === "local") {
      this.clearScheduledSync();
      this.setState({
        status: "local_only",
        message: "Använder bara lokal lagring.",
      });
      return;
    }

    const client = this.cloudClient(provider);
    if (!client) {
      this.clearScheduledSync();
      this.setState({
        status: "disconnected",
        message: "Den här leverantören är inte implementerad än.",
      });
      return;
    }

    if (!client.canUse()) {
      debugWarn(`[sync] Client for ${provider} cannot be used (missing env var?)`);
      this.setState({
        status: "error",
        message: provider === "onedrive"
          ? "Sätt VITE_ONEDRIVE_CLIENT_ID för att aktivera synk med OneDrive."
          : "Sätt VITE_GOOGLE_CLIENT_ID för att aktivera synk med Google Drive.",
      });
      return;
    }

    const authCompleted = await client.completeAuthorizationIfPresent();
    debugLog(`[sync] completeAuthorizationIfPresent: ${authCompleted}, isConnected: ${client.isConnected()}`);

    if (!client.isConnected()) {
      this.setState({
        status: "disconnected",
        message: authCompleted ? "Svar från anslutning hanterat. Anslut igen." : "Inte ansluten.",
      });
      return;
    }

    this.setState({
      status: "connected",
      message: provider === "onedrive" ? "Ansluten till OneDrive." : "Ansluten till Google Drive.",
    });
    await this.syncNow();
  }

  private scheduleBackgroundSync(): void {
    const provider = this.store.get("syncProvider");
    if (provider === "local" || this.state.status === "error" || this.state.status === "connecting") {
      return;
    }

    this.clearScheduledSync();
    this.syncTimer = setTimeout(() => {
      this.syncNow().catch(error => this.handleSyncError(error));
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

  private handleSyncError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    if (error instanceof AuthExpiredError) {
      this.clearScheduledSync();
      this.setState({ status: "auth_expired", message: null, error: err });
    } else {
      this.setState({ status: "error", message: err.message, error: err });
    }
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

  private cloudClient(provider: SyncProvider): CloudSyncClient | null {
    switch (provider) {
      case "onedrive":
        return this.oneDriveClient;
      case "google-drive":
        return this.googleDriveClient;
      default:
        return null;
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

interface CloudSyncClient {
  canUse(): boolean;
  beginAuthorization(): Promise<void>;
  completeAuthorizationIfPresent(): Promise<boolean>;
  isConnected(): boolean;
  disconnect(): void;
  downloadDocument(): Promise<AppDataDocument | null>;
  uploadDocument(document: AppDataDocument): Promise<void>;
}
