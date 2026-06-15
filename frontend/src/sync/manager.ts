import { getAppDataStore } from "../persistence/store";
import type { AppDataDocument, SyncProvider } from "../persistence/schema";
import { mergeDocuments } from "./merge";
import { GoogleDriveClient } from "./google-drive";
import { OneDriveClient } from "./onedrive";
import { BackendSyncClient, type BackendUserInfo } from "./backend";
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
  private readonly backendClient = new BackendSyncClient();
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
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS_MS = [10_000, 30_000, 90_000];
  private isApplyingRemoteDocument = false;
  private pendingLocalDocument: AppDataDocument | null = null;
  private pendingRemoteDocument: AppDataDocument | null = null;

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

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.state.status === "connected") {
        this.clearScheduledSync();
        this.syncNow().catch(error => this.handleSyncError(error));
      }
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
          : provider === "google-drive"
          ? "Sätt VITE_GOOGLE_CLIENT_ID för att aktivera synk med Google Drive."
          : "Backend-synk är inte konfigurerad.",
      });
      return;
    }

    this.setState({
      status: "connecting",
      message: provider === "onedrive"
        ? "Ansluter till OneDrive..."
        : provider === "google-drive"
        ? "Ansluter till Google Drive..."
        : "Ansluter till backend...",
    });
    await client.beginAuthorization();
  }

  getBackendUserInfo(): BackendUserInfo | null {
    return this.backendClient.getUserInfo();
  }

  async exportAccount(): Promise<void> {
    return this.backendClient.exportAccount();
  }

  async deleteAccount(): Promise<void> {
    await this.backendClient.deleteAccount();
    this.store.set("syncProvider", "local");
  }

  // beginBackendAuthorization is called by the sign-in UI (Phase 4).
  // It sets the email on the backend client and redirects to the auth service.
  beginBackendAuthorization(email: string): void {
    this.backendClient.setEmail(email);
    this.backendClient.beginAuthorization().catch(err => this.handleSyncError(err));
  }

  // startEmailAuth / verifyEmailCode drive the email (code) login flow from the
  // sign-in UI. See BackendSyncClient for the request/response shapes.
  async startEmailAuth(email: string, language: string) {
    return this.backendClient.startEmailAuth(email, language);
  }

  async verifyEmailCode(email: string, code: string, name: string) {
    return this.backendClient.verifyEmailCode(email, code, name);
  }

  // completeEmailLogin finalizes a successful code verification. The auth cookies
  // are already set by the server, so switching the provider to "backend" triggers
  // the same path as the OIDC ?auth_success redirect (fetch /auth/me, then sync).
  completeEmailLogin(): void {
    this.store.set("syncProvider", "backend");
  }

  // beginLinkAuthorization initiates an OIDC flow to link another provider to the
  // current account. The browser navigates away; the result comes back via URL param.
  beginLinkAuthorization(email: string): void {
    this.backendClient.beginLinkAuthorization(email);
  }

  // unlinkProvider removes a provider from the current account and refreshes user info.
  async unlinkProvider(provider: string): Promise<void> {
    await this.backendClient.unlinkProvider(provider);
  }

  // refreshBackendUserInfo re-fetches /auth/me and updates the stored user info.
  // Call this after a link redirect to pick up the newly added identity.
  async refreshBackendUserInfo(): Promise<void> {
    await this.backendClient.completeAuthorizationIfPresent();
  }

  // Admin user management (requires the "admin" role; enforced by the backend).
  async adminListUsers() {
    return this.backendClient.adminListUsers();
  }

  async adminUpdateDisplayName(id: string, displayName: string): Promise<void> {
    await this.backendClient.adminUpdateDisplayName(id, displayName);
  }

  async adminSetAdmin(id: string, admin: boolean): Promise<void> {
    await this.backendClient.adminSetAdmin(id, admin);
  }

  disconnect(): void {
    const provider = this.store.get("syncProvider");
    const client = this.cloudClient(provider);
    if (client) {
      client.disconnect();
    }

    if (provider === "backend") {
      // Backend sync is identity-bound — revert to local on sign-out.
      // handleProviderChanged fires via the subscription and sets status to local_only.
      this.store.set("syncProvider", "local");
      return;
    }

    this.setState({
      status: provider === "local" ? "local_only" : "disconnected",
      message: provider === "local" ? null : "Frånkopplad.",
    });
  }

  retrySync(): void {
    this.syncNow().catch(err => this.handleSyncError(err));
  }

  async resolveConflict(choice: "local" | "remote"): Promise<void> {
    if (this.state.status !== "conflict_resolution") return;
    const localDoc = this.pendingLocalDocument;
    const remoteDoc = this.pendingRemoteDocument;
    if (!localDoc || !remoteDoc) return;

    this.pendingLocalDocument = null;
    this.pendingRemoteDocument = null;

    const chosen = choice === "local" ? localDoc : remoteDoc;
    const provider = this.store.get("syncProvider");
    const client = this.cloudClient(provider);

    this.setState({ status: "syncing", message: "Synkar..." });

    this.isApplyingRemoteDocument = true;
    this.store.setDocument(chosen);
    this.isApplyingRemoteDocument = false;

    try {
      if (client?.isConnected()) {
        await client.uploadDocument(chosen);
        this.saveBaseDocument(provider, chosen);
      }
    } catch (error) {
      this.handleSyncError(error);
      return;
    }

    this.retryCount = 0;
    this.setState({
      status: "connected",
      message: "Synkad.",
      lastSyncedAt: new Date().toISOString(),
      lastConflictResolutionAt: new Date().toISOString(),
    });
  }

  async syncNow(): Promise<SyncResult> {
    this.clearRetryTimer();
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
          : provider === "google-drive"
          ? "Anslut till Google Drive först."
          : "Inte ansluten till backend.",
      });
      return { conflictDetected: false, pushedLocalChanges: false };
    }

    this.setState({ status: "syncing", message: "Synkar..." });

    const remoteDocument = await client.downloadDocument();

    // Read local AFTER the async download so any changes made during the download are included.
    const localDocument = this.store.getDocument();
    debugLog(`[sync] Starting sync with ${provider}. Local updatedAt: ${localDocument.updatedAt}`);

    if (!remoteDocument) {
      debugLog("[sync] No remote document found — uploading local as initial.");
      await client.uploadDocument(localDocument);
      this.saveBaseDocument(provider, localDocument);
      this.retryCount = 0;
      this.setState({
        status: "connected",
        message: provider === "onedrive" ? "Synkad med OneDrive." : provider === "google-drive" ? "Synkad med Google Drive." : "Synkad.",
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
      debugWarn("[sync] Conflict detected — asking user to resolve.");
      this.backupDocument(localDocument, provider);
      this.pendingLocalDocument = localDocument;
      this.pendingRemoteDocument = remoteDocument;
      this.setState({ status: "conflict_resolution", message: null });
      return { conflictDetected: true, pushedLocalChanges: false };
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

    this.retryCount = 0;
    this.saveBaseDocument(provider, mergedDocument);
    this.setState({
      status: "connected",
      message: "Synkad.",
      lastSyncedAt: new Date().toISOString(),
    });

    debugLog("[sync] Sync complete. No conflicts.");

    return { conflictDetected: false, pushedLocalChanges: mergedDiffersFromRemote };
  }

  private async handleProviderChanged(): Promise<void> {
    this.clearRetryTimer();
    this.retryCount = 0;
    const provider = this.store.get("syncProvider");
    debugLog(`[sync] handleProviderChanged: provider=${provider}`);

    // Detect post-login redirect from the auth service (?auth_success=1).
    // This fires regardless of the current provider so the switch is automatic.
    if (provider !== "backend") {
      const params = new URLSearchParams(window.location.search);
      if (params.has("auth_success")) {
        params.delete("auth_success");
        const q = params.toString();
        window.history.replaceState(
          {},
          "",
          window.location.pathname + (q ? "?" + q : "") + window.location.hash
        );
        this.store.set("syncProvider", "backend");
        return; // handleProviderChanged fires again via subscription with provider="backend"
      }
    }

    // Detect post-link redirect from the auth service (?link_success=1 or ?link_error=X).
    // Refresh user info and stash the result in sessionStorage for AccountStatus to consume.
    {
      const params = new URLSearchParams(window.location.search);
      const linkSuccess = params.has("link_success");
      const linkError = params.get("link_error");
      if (linkSuccess || linkError) {
        params.delete("link_success");
        params.delete("link_error");
        const q = params.toString();
        window.history.replaceState(
          {},
          "",
          window.location.pathname + (q ? "?" + q : "") + window.location.hash
        );
        if (linkSuccess) {
          await this.backendClient.completeAuthorizationIfPresent();
          sessionStorage.setItem("link_success", "1");
        }
        if (linkError) {
          sessionStorage.setItem("link_error", linkError);
        }
        // Sync state is unchanged — fall through to the normal connected flow.
      }
    }

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
          : provider === "google-drive"
          ? "Sätt VITE_GOOGLE_CLIENT_ID för att aktivera synk med Google Drive."
          : "Backend-synk är inte konfigurerad.",
      });
      return;
    }

    const authCompleted = await client.completeAuthorizationIfPresent();
    debugLog(`[sync] completeAuthorizationIfPresent: ${authCompleted}, isConnected: ${client.isConnected()}`);

    if (!client.isConnected()) {
      if (client.wasAuthExpired()) {
        this.setState({ status: "auth_expired", message: null, error: null });
      } else {
        this.setState({
          status: "disconnected",
          message: authCompleted ? "Svar från anslutning hanterat. Anslut igen." : "Inte ansluten.",
        });
      }
      return;
    }

    this.setState({
      status: "connected",
      message: provider === "onedrive"
        ? "Ansluten till OneDrive."
        : provider === "google-drive"
        ? "Ansluten till Google Drive."
        : "Ansluten till backend.",
    });
    await this.syncNow();
  }

  private scheduleBackgroundSync(): void {
    const provider = this.store.get("syncProvider");
    if (provider === "local" || this.state.status === "error" || this.state.status === "connecting" || this.state.status === "conflict_resolution") {
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

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
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
    const prefix = `${backupStoragePrefix}${provider}:`;
    const key = `${prefix}${new Date().toISOString()}`;
    localStorage.setItem(key, JSON.stringify(document));

    const allKeys = Object.keys(localStorage).filter(k => k.startsWith(prefix)).sort();
    for (const old of allKeys.slice(0, -5)) {
      localStorage.removeItem(old);
    }
  }

  private handleSyncError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    if (error instanceof AuthExpiredError) {
      this.clearScheduledSync();
      this.clearRetryTimer();
      this.retryCount = 0;
      this.setState({ status: "auth_expired", message: null, error: err });
    } else if (this.retryCount < this.MAX_RETRIES) {
      const delay = this.RETRY_DELAYS_MS[this.retryCount];
      this.retryCount++;
      this.clearRetryTimer();
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.syncNow().catch(e => this.handleSyncError(e));
      }, delay);
      this.setState({ status: "error", message: err.message, error: err });
    } else {
      this.retryCount = 0;
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
      case "backend":
        return this.backendClient;
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
  wasAuthExpired(): boolean;
  disconnect(): void;
  downloadDocument(): Promise<AppDataDocument | null>;
  uploadDocument(document: AppDataDocument): Promise<void>;
}
