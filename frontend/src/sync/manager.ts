import { getAppDataStore } from "../persistence/store";
import type { AppDataDocument } from "../persistence/schema";
import { mergeDocuments } from "./merge";
import { BackendSyncClient, type BackendUserInfo } from "./backend";
import { AuthExpiredError, DocumentChangedError, type SyncResult, type SyncState } from "./types";

const debug = import.meta.env.VITE_DEBUG === "true";
const debugLog = (...args: unknown[]) => { if (debug) console.log(...args); };
const debugWarn = (...args: unknown[]) => { if (debug) console.warn(...args); };

type SyncStateListener = (state: SyncState) => void;
type Unsubscribe = () => void;

const baseDocumentStorageKey = "sync-base-document:backend";
const backupStoragePrefix = "sync-backup:backend:";

// Storage left behind by the removed OneDrive/Google Drive sync: OAuth tokens,
// PKCE state and their per-provider base documents and conflict backups. Cleared
// once on start so no stale credentials linger in localStorage.
const legacyStorageKeys = [
  "sync-onedrive-token",
  "sync-onedrive-pkce",
  "sync-onedrive-auth-expired",
  "sync-google-drive-token",
  "sync-google-drive-pkce",
  "sync-google-drive-auth-expired",
  "sync-base-document:onedrive",
  "sync-base-document:google-drive",
  "sync-base-document:dropbox",
  "sync-base-document:local",
];
const legacyStoragePrefixes = [
  "sync-backup:onedrive:",
  "sync-backup:google-drive:",
  "sync-backup:dropbox:",
  "sync-backup:local:",
];

class SyncManager {
  private readonly store = getAppDataStore();
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
  // The version the pending conflict was read from. A user can leave the prompt up
  // for a long time, so by the time they answer the server may have moved on again.
  private pendingRemoteEtag: string | null = null;
  // A sync in progress, so the four things that can ask for one — the debounced
  // scheduler, the visibility handler, the retry timer and the user's "try now"
  // button — join it instead of running a second download/merge/upload over it.
  private inFlightSync: Promise<SyncResult> | null = null;
  private resyncWhenIdle = false;
  // How many times one syncNow() re-reads and re-merges after the server rejects
  // its upload as stale. Each retry only loses to a device that wrote in the
  // meantime, so a small bound is enough; the scheduler covers the rest.
  private readonly MAX_STALE_RETRIES = 3;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    purgeLegacySyncStorage();

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

  async submitFeedback(message: string, language: string): Promise<void> {
    return this.backendClient.submitFeedback(message, language);
  }

  // beginBackendAuthorization is called by the sign-in UI. It sets the email on
  // the backend client and redirects to the auth service.
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

  async adminLogoutUser(id: string): Promise<void> {
    await this.backendClient.adminLogoutUser(id);
  }

  // Logs the current user out on all other devices (keeps this session).
  async logoutOtherDevices(): Promise<void> {
    await this.backendClient.logoutOtherDevices();
  }

  // Signs out: drops the backend session and reverts to local-only storage.
  // handleProviderChanged fires via the subscription and sets status to local_only.
  disconnect(): void {
    this.backendClient.disconnect();
    this.store.set("syncProvider", "local");
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
    const etag = this.pendingRemoteEtag;
    this.pendingRemoteEtag = null;

    const chosen = choice === "local" ? localDoc : remoteDoc;

    this.setState({ status: "syncing", message: "Synkar..." });

    this.isApplyingRemoteDocument = true;
    this.store.setDocument(chosen);
    this.isApplyingRemoteDocument = false;

    try {
      if (this.backendClient.isConnected()) {
        await this.backendClient.uploadDocument(chosen, etag);
        this.saveBaseDocument(chosen);
      }
    } catch (error) {
      // The prompt can sit unanswered for a long time, so by now a third device may
      // have written. The user's choice is already the local document, so a fresh
      // sync merges from there — and asks again if that is still a conflict.
      if (error instanceof DocumentChangedError) {
        debugWarn("[sync] Document changed while the conflict prompt was open — syncing again.");
        this.syncNow().catch(e => this.handleSyncError(e));
        return;
      }
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

  // Serializes syncing. A caller arriving while a sync is running joins that run
  // rather than starting a competing one, and its request is remembered so changes
  // made during the run are not left unsynced: once the run finishes, another pass
  // is scheduled through the normal debounce.
  async syncNow(): Promise<SyncResult> {
    if (this.inFlightSync) {
      this.resyncWhenIdle = true;
      return this.inFlightSync;
    }

    const run = this.runSync();
    this.inFlightSync = run;
    try {
      return await run;
    } finally {
      this.inFlightSync = null;
      if (this.resyncWhenIdle) {
        this.resyncWhenIdle = false;
        this.scheduleBackgroundSync();
      }
    }
  }

  private async runSync(staleRetries = 0): Promise<SyncResult> {
    this.clearRetryTimer();
    const provider = this.store.get("syncProvider");
    if (provider !== "backend") {
      this.setState({ status: "local_only", message: null });
      return { conflictDetected: false, pushedLocalChanges: false };
    }

    if (!this.backendClient.isConnected()) {
      debugWarn("[sync] syncNow() called but the backend client is not connected. Token missing?");
      this.setState({ status: "disconnected", message: "Inte ansluten till backend." });
      return { conflictDetected: false, pushedLocalChanges: false };
    }

    this.setState({ status: "syncing", message: "Synkar..." });

    const remote = await this.backendClient.downloadDocument();
    const remoteDocument = remote?.document ?? null;
    // Everything uploaded below is based on this exact version, and says so via
    // If-Match. A null etag means we read no document and are creating the first.
    const baseEtag = remote?.etag ?? null;

    // Read local AFTER the async download so any changes made during the download are included.
    const localDocument = this.store.getDocument();
    debugLog(`[sync] Starting sync. Local updatedAt: ${localDocument.updatedAt}`);

    if (!remoteDocument) {
      debugLog("[sync] No remote document found — uploading local as initial.");
      const uploaded = await this.uploadOrRestart(localDocument, null, staleRetries);
      if (uploaded !== "ok") return uploaded;
      this.saveBaseDocument(localDocument);
      this.retryCount = 0;
      this.setState({
        status: "connected",
        message: "Synkad.",
        lastSyncedAt: new Date().toISOString(),
      });
      debugLog("[sync] Initial upload complete.");
      return { conflictDetected: false, pushedLocalChanges: true };
    }

    debugLog(`[sync] Remote document found. Remote updatedAt: ${remoteDocument.updatedAt}`);

    const baseDocument = this.readBaseDocument();
    const mergeResult = mergeDocuments(baseDocument, localDocument, remoteDocument);
    const mergedDocument = mergeResult.document;

    const mergedDiffersFromLocal = !areEqual(localDocument, mergedDocument);
    const mergedDiffersFromRemote = !areEqual(remoteDocument, mergedDocument);

    debugLog(`[sync] Merge result — conflictDetected: ${mergeResult.conflictDetected}, applyingRemoteChanges: ${mergedDiffersFromLocal}, uploadingToRemote: ${mergedDiffersFromRemote}`);

    if (mergeResult.conflictDetected) {
      debugWarn("[sync] Conflict detected — asking user to resolve.");
      this.backupDocument(localDocument);
      this.pendingLocalDocument = localDocument;
      this.pendingRemoteDocument = remoteDocument;
      this.pendingRemoteEtag = baseEtag;
      this.setState({ status: "conflict_resolution", message: null });
      return { conflictDetected: true, pushedLocalChanges: false };
    }

    // Upload before touching the local store. A rejected upload means the merge was
    // computed against a version that is no longer current, and applying it locally
    // first would leave this device holding a merge the server refused.
    if (mergedDiffersFromRemote) {
      const uploaded = await this.uploadOrRestart(mergedDocument, baseEtag, staleRetries);
      if (uploaded !== "ok") return uploaded;
      debugLog("[sync] Uploaded merged document to remote.");
    }

    if (mergedDiffersFromLocal) {
      this.isApplyingRemoteDocument = true;
      this.store.setDocument(mergedDocument);
      this.isApplyingRemoteDocument = false;
      debugLog("[sync] Applied remote changes to local store.");
    }

    this.retryCount = 0;
    this.saveBaseDocument(mergedDocument);
    this.setState({
      status: "connected",
      message: "Synkad.",
      lastSyncedAt: new Date().toISOString(),
    });

    debugLog("[sync] Sync complete. No conflicts.");

    return { conflictDetected: false, pushedLocalChanges: mergedDiffersFromRemote };
  }

  // Uploads a document that was merged from the version named by etag. "ok" means it
  // landed; anything else is the result of the fresh sync started because the server
  // rejected it as stale, and the caller should return that instead of carrying on
  // with a merge the server has already refused.
  private async uploadOrRestart(
    document: AppDataDocument,
    etag: string | null,
    staleRetries: number,
  ): Promise<"ok" | SyncResult> {
    try {
      await this.backendClient.uploadDocument(document, etag);
      return "ok";
    } catch (error) {
      if (!(error instanceof DocumentChangedError) || staleRetries >= this.MAX_STALE_RETRIES) {
        throw error;
      }
      debugWarn(`[sync] Upload rejected as stale — another device wrote first. Re-reading and merging again (attempt ${staleRetries + 1} of ${this.MAX_STALE_RETRIES}).`);
      return this.runSync(staleRetries + 1);
    }
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

    if (provider !== "backend") {
      this.clearScheduledSync();
      this.setState({
        status: "local_only",
        message: "Använder bara lokal lagring.",
      });
      return;
    }

    const authCompleted = await this.backendClient.completeAuthorizationIfPresent();
    debugLog(`[sync] completeAuthorizationIfPresent: ${authCompleted}, isConnected: ${this.backendClient.isConnected()}`);

    if (!this.backendClient.isConnected()) {
      if (this.backendClient.wasAuthExpired()) {
        this.setState({ status: "auth_expired", message: null, error: null });
      } else {
        this.setState({
          status: "disconnected",
          message: authCompleted ? "Svar från anslutning hanterat. Anslut igen." : "Inte ansluten.",
        });
      }
      return;
    }

    this.setState({ status: "connected", message: "Ansluten till backend." });
    await this.syncNow();
  }

  private scheduleBackgroundSync(): void {
    const provider = this.store.get("syncProvider");
    if (provider !== "backend" || this.state.status === "error" || this.state.status === "conflict_resolution") {
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

  private saveBaseDocument(document: AppDataDocument): void {
    localStorage.setItem(baseDocumentStorageKey, JSON.stringify(document));
  }

  private readBaseDocument(): AppDataDocument | null {
    const raw = localStorage.getItem(baseDocumentStorageKey);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as AppDataDocument;
    } catch {
      return null;
    }
  }

  private backupDocument(document: AppDataDocument): void {
    const key = `${backupStoragePrefix}${new Date().toISOString()}`;
    localStorage.setItem(key, JSON.stringify(document));

    const allKeys = Object.keys(localStorage).filter(k => k.startsWith(backupStoragePrefix)).sort();
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

function purgeLegacySyncStorage(): void {
  for (const key of legacyStorageKeys) {
    localStorage.removeItem(key);
  }

  for (const key of Object.keys(localStorage)) {
    if (legacyStoragePrefixes.some(prefix => key.startsWith(prefix))) {
      localStorage.removeItem(key);
    }
  }
}
