import { getAppDataStore } from "../persistence/store";
import type { AppDataDocument } from "../persistence/schema";
import { mergeDocuments } from "./merge";
import { deepEqual } from "../utilities/deep-equal";
import { BackendSyncClient, type BackendUserInfo } from "./backend";
import { AuthExpiredError, ClientOutdatedError, DocumentChangedError, DocumentTooLargeError, type SyncResult, type SyncState } from "./types";
import { getSyncProvider, setSyncProvider, subscribeSyncProvider } from "./provider";

const debug = import.meta.env.VITE_DEBUG === "true";
const debugLog = (...args: unknown[]) => { if (debug) console.log(...args); };
const debugWarn = (...args: unknown[]) => { if (debug) console.warn(...args); };

type SyncStateListener = (state: SyncState) => void;
type Unsubscribe = () => void;

const legacyBaseDocumentStorageKey = "sync-base-document:backend";
const baseDocumentStoragePrefix = "sync-base-document:backend:account:";
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
  private pendingBaseDocument: AppDataDocument | null = null;
  // The version the pending conflict was read from. A user can leave the prompt up
  // for a long time, so by the time they answer the server may have moved on again.
  private pendingRemoteEtag: string | null = null;
  private pendingAccountId = "";
  // A sync in progress, so the four things that can ask for one — the debounced
  // scheduler, the visibility handler, the retry timer and the user's "try now"
  // button — join it instead of running a second download/merge/upload over it.
  private inFlightSync: Promise<SyncResult> | null = null;
  private resyncWhenIdle = false;
  // How many times one syncNow() re-reads and re-merges after the server rejects
  // its upload as stale. Each retry only loses to a device that wrote in the
  // meantime, so a small bound is enough; the scheduler covers the rest.
  private readonly MAX_STALE_RETRIES = 3;
  // Kept per running tab. Reading one shared localStorage value before every merge
  // let another tab move the common ancestor underneath this tab, turning an old
  // empty value into an apparent deletion. It is persisted per account for reloads,
  // while this in-memory copy remains this tab's own history.
  private syncAccountKey: string | null = null;
  private syncAccountId = "";
  private baseDocument: AppDataDocument | null = null;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    purgeLegacySyncStorage();

    subscribeSyncProvider(() => {
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
        this.syncWhenReachable();
      }
    });

    // A device that regains its connection has almost certainly been unable to
    // sync while it was gone, and is the one moment where trying again is
    // guaranteed to be worth it.
    window.addEventListener("online", () => {
      if (this.state.status === "connected" || this.state.status === "error") {
        this.clearRetryTimer();
        this.retryCount = 0;
        this.syncNow().catch(error => this.handleSyncError(error));
      }
    });

    this.handleProviderChanged().catch(error => this.handleSyncError(error));
  }

  // Syncs on returning to the app, but not into a network that is not there yet.
  //
  // visibilitychange fires when the app comes to the foreground, which on a phone
  // is a moment or two before the radio has finished reassociating. A fetch issued
  // in that window does not wait — it fails at once, and the first thing the user
  // sees on opening the app is a warning about it. Waiting for the browser to say
  // it is online costs nothing when it already is.
  private syncWhenReachable(): void {
    if (navigator.onLine === false) {
      // The "online" listener above will pick this up. Nothing is lost by
      // waiting: there is no network to sync over.
      debugLog("[sync] resumed while offline; waiting for the connection");
      return;
    }
    this.syncNow().catch(error => this.handleSyncError(error));
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

  reportLanguage(language: string): void {
    void this.backendClient.reportLanguage(language);
  }

  getBackendUserInfo(): BackendUserInfo | null {
    return this.backendClient.getUserInfo();
  }

  async exportAccount(): Promise<void> {
    return this.backendClient.exportAccount();
  }

  async deleteAccount(): Promise<void> {
    await this.backendClient.deleteAccount();
    setSyncProvider("local");
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
    setSyncProvider("backend");
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

  async adminOrgTree() {
    return await this.backendClient.adminOrgTree();
  }

  async adminCreateFederation(id: string, name: string) {
    return await this.backendClient.adminCreateFederation(id, name);
  }

  async adminRenameFederation(id: string, name: string) {
    await this.backendClient.adminRenameFederation(id, name);
  }

  async adminCreateBranch(name: string, federationId?: string) {
    return await this.backendClient.adminCreateBranch(name, federationId);
  }

  async adminUpdateBranch(id: string, changes: { name?: string; federationId?: string }) {
    await this.backendClient.adminUpdateBranch(id, changes);
  }

  async adminBranchMembers(branchId: string) {
    return await this.backendClient.adminBranchMembers(branchId);
  }

  async adminGetUser(id: string) {
    return await this.backendClient.adminGetUser(id);
  }

  async adminCreateUser(branchId: string, email: string, name: string, language: string) {
    return await this.backendClient.adminCreateUser(branchId, email, name, language);
  }

  async myTransfer() {
    return await this.backendClient.myTransfer();
  }

  async requestTransfer(toBranchId: string, note: string) {
    await this.backendClient.requestTransfer(toBranchId, note);
  }

  async withdrawTransfer() {
    await this.backendClient.withdrawTransfer();
  }

  async adminListTransfers() {
    return await this.backendClient.adminListTransfers();
  }

  async adminDecideTransfer(memberId: string, accept: boolean) {
    await this.backendClient.adminDecideTransfer(memberId, accept);
  }

  async adminListRequests() {
    return await this.backendClient.adminListRequests();
  }

  async adminDecideRequest(email: string, approve: boolean) {
    await this.backendClient.adminDecideRequest(email, approve);
  }

  async listBranches() {
    return await this.backendClient.listBranches();
  }

  async getJoinContext() {
    return await this.backendClient.getJoinContext();
  }

  async submitJoinRequest(branchId: string, name: string, note: string, language: string) {
    return await this.backendClient.submitJoinRequest(branchId, name, note, language);
  }

  async withdrawJoinRequest(): Promise<void> {
    await this.backendClient.withdrawJoinRequest();
  }

  async adminSetRoles(id: string, roles: string[]): Promise<void> {
    await this.backendClient.adminSetRoles(id, roles);
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
    this.syncAccountKey = null;
    this.syncAccountId = "";
    this.baseDocument = null;
    setSyncProvider("local");
  }

  retrySync(): void {
    this.syncNow().catch(err => this.handleSyncError(err));
  }

  async resolveConflict(choice: "local" | "remote"): Promise<void> {
    if (this.state.status !== "conflict_resolution") return;
    const baseDoc = this.pendingBaseDocument;
    const localDoc = this.pendingLocalDocument;
    const remoteDoc = this.pendingRemoteDocument;
    if (!localDoc || !remoteDoc) return;

    this.pendingBaseDocument = null;
    this.pendingLocalDocument = null;
    this.pendingRemoteDocument = null;
    const etag = this.pendingRemoteEtag;
    const accountId = this.pendingAccountId;
    this.pendingRemoteEtag = null;
    this.pendingAccountId = "";

    // Apply the answer only to values that actually conflicted. Independent changes
    // from both devices still belong to the user. Then layer on anything edited while
    // the prompt was open, preferring that later local work if it touched the same
    // value again.
    const resolved = mergeDocuments(baseDoc, localDoc, remoteDoc, choice).document;
    const current = this.store.getDocument();
    const chosen = mergeDocuments(localDoc, current, resolved, "local").document;

    this.setState({ status: "syncing", message: "Synkar..." });

    // Put the user's resolved document locally before the request. If a third device
    // wins the server race, the fresh sync below can merge from the choice instead of
    // forgetting what the user just selected.
    this.isApplyingRemoteDocument = true;
    this.store.setDocument(chosen);
    this.isApplyingRemoteDocument = false;

    try {
      if (this.backendClient.isConnected()) {
        await this.backendClient.uploadDocument(chosen, etag, accountId);
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
    const provider = getSyncProvider();
    if (provider !== "backend") {
      this.setState({ status: "local_only", message: null });
      return { conflictDetected: false, pushedLocalChanges: false };
    }

    if (!this.backendClient.isConnected()) {
      debugWarn("[sync] syncNow() called but the backend client is not connected. Token missing?");
      this.setState({ status: "disconnected", message: "Inte ansluten till backend." });
      return { conflictDetected: false, pushedLocalChanges: false };
    }

    if (!this.bindToAuthenticatedAccount()) {
      debugWarn("[sync] refusing to sync without an authenticated account identity");
      this.setState({ status: "disconnected", message: "Inte ansluten." });
      return { conflictDetected: false, pushedLocalChanges: false };
    }

    this.setState({ status: "syncing", message: "Synkar..." });

    // Capture the account for this whole read/merge/write pass. The server checks
    // this id against the cookie on both requests, so another tab changing the
    // shared login in between cannot redirect this document into another account.
    const accountId = this.syncAccountId;
    const remote = await this.backendClient.downloadDocument(accountId);
    const remoteDocument = remote?.document ?? null;
    // Everything uploaded below is based on this exact version, and says so via
    // If-Match. A null etag means we read no document and are creating the first.
    const baseEtag = remote?.etag ?? null;

    // Read local AFTER the async download so any changes made during the download are included.
    const localDocument = this.store.getDocument();
    debugLog(`[sync] Starting sync. Local updatedAt: ${localDocument.updatedAt}`);

    if (!remoteDocument) {
      debugLog("[sync] No remote document found — uploading local as initial.");
      const uploaded = await this.uploadOrRestart(localDocument, null, staleRetries, accountId);
      if (uploaded !== "ok") return uploaded;
      this.saveBaseDocument(localDocument);
      if (!deepEqual(this.store.getDocument(), localDocument)) {
        this.resyncWhenIdle = true;
      }
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

    const mergedDiffersFromLocal = !deepEqual(localDocument, mergedDocument);
    const mergedDiffersFromRemote = !deepEqual(remoteDocument, mergedDocument);

    debugLog(`[sync] Merge result — conflictDetected: ${mergeResult.conflictDetected}, applyingRemoteChanges: ${mergedDiffersFromLocal}, uploadingToRemote: ${mergedDiffersFromRemote}`);

    if (mergeResult.conflictDetected) {
      debugWarn("[sync] Conflict detected — asking user to resolve.");
      this.backupDocument(localDocument);
      this.pendingBaseDocument = baseDocument;
      this.pendingLocalDocument = localDocument;
      this.pendingRemoteDocument = remoteDocument;
      this.pendingRemoteEtag = baseEtag;
      this.pendingAccountId = accountId;
      this.setState({ status: "conflict_resolution", message: null });
      return { conflictDetected: true, pushedLocalChanges: false };
    }

    // Upload before touching the local store. A rejected upload means the merge was
    // computed against a version that is no longer current, and applying it locally
    // first would leave this device holding a merge the server refused.
    if (mergedDiffersFromRemote) {
      const uploaded = await this.uploadOrRestart(mergedDocument, baseEtag, staleRetries, accountId);
      if (uploaded !== "ok") return uploaded;
      debugLog("[sync] Uploaded merged document to remote.");
    }

    // A request can be slow enough for the user to edit while its upload is in
    // flight. Applying the earlier merge now would erase that edit. Leave the newer
    // local document in place and run one more merge against what the server accepted.
    const localChangedWhileSyncing = !deepEqual(this.store.getDocument(), localDocument);
    if (localChangedWhileSyncing) {
      this.resyncWhenIdle = true;
    } else if (mergedDiffersFromLocal) {
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
    accountId: string,
  ): Promise<"ok" | SyncResult> {
    try {
      await this.backendClient.uploadDocument(document, etag, accountId);
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
    const provider = getSyncProvider();
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
        setSyncProvider("backend");
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
    const provider = getSyncProvider();
    if (provider !== "backend"
      || this.state.status === "error"
      || this.state.status === "conflict_resolution"
      || this.state.status === "client_outdated"
      || this.state.status === "document_too_large") {
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

  private bindToAuthenticatedAccount(): boolean {
    const info = this.backendClient.getUserInfo();
    const accountKey = info?.email.trim().toLowerCase() ?? "";
    const accountId = info?.id.trim() ?? "";
    if (!accountKey) return false;
    if (this.syncAccountKey === accountKey) {
      this.syncAccountId = accountId;
      return true;
    }

    const binding = this.store.bindToAccount(accountKey);
    this.syncAccountKey = accountKey;
    this.syncAccountId = accountId;

    const scopedKey = this.baseStorageKey(accountKey);
    let raw = localStorage.getItem(scopedKey);
    // One-time migration: the unscoped document and base belonged to the account
    // already signed in on this origin. Never carry that base into a different
    // account, where it would describe somebody else's data.
    if (raw === null && binding !== "switched") {
      raw = localStorage.getItem(legacyBaseDocumentStorageKey);
      if (raw !== null) localStorage.setItem(scopedKey, raw);
    }
    localStorage.removeItem(legacyBaseDocumentStorageKey);

    if (raw === null) {
      this.baseDocument = null;
      return true;
    }
    try {
      this.baseDocument = JSON.parse(raw) as AppDataDocument;
    } catch {
      this.baseDocument = null;
    }
    return true;
  }

  private baseStorageKey(accountKey: string): string {
    return `${baseDocumentStoragePrefix}${encodeURIComponent(accountKey)}`;
  }

  private saveBaseDocument(document: AppDataDocument): void {
    this.baseDocument = document;
    if (this.syncAccountKey !== null) {
      localStorage.setItem(this.baseStorageKey(this.syncAccountKey), JSON.stringify(document));
    }
  }

  private readBaseDocument(): AppDataDocument | null {
    return this.baseDocument;
  }

  private backupDocument(document: AppDataDocument): void {
    const accountPart = this.syncAccountKey === null ? "" : `${encodeURIComponent(this.syncAccountKey)}:`;
    const accountPrefix = `${backupStoragePrefix}${accountPart}`;
    const key = `${accountPrefix}${new Date().toISOString()}`;
    localStorage.setItem(key, JSON.stringify(document));

    const allKeys = Object.keys(localStorage).filter(k => k.startsWith(accountPrefix)).sort();
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
    } else if (error instanceof ClientOutdatedError) {
      // Retrying cannot help — the app has to be updated first — and every attempt
      // is a write the server will refuse. Stop until the user reloads into a
      // build that can read what is stored. Local changes keep being saved on this
      // device meanwhile, and sync resumes once it can do so without deleting data.
      this.clearScheduledSync();
      this.clearRetryTimer();
      this.retryCount = 0;
      this.setState({ status: "client_outdated", message: null, error: err });
    } else if (error instanceof DocumentTooLargeError) {
      // Also nothing to retry: the same bytes would be refused every time, and three
      // rejected megabyte uploads help nobody. Unlike an outdated client there is no
      // reload that fixes it either, so this parks until the document gets smaller.
      // Local changes keep being saved on this device throughout — what has stopped
      // is them reaching the user's other devices.
      this.clearScheduledSync();
      this.clearRetryTimer();
      this.retryCount = 0;
      this.setState({ status: "document_too_large", message: null, error: err });
    } else if (this.retryCount < this.MAX_RETRIES) {
      const delay = this.RETRY_DELAYS_MS[this.retryCount];
      this.retryCount++;
      this.clearRetryTimer();
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.syncNow().catch(e => this.handleSyncError(e));
      }, delay);
      // The first failure is reported to nobody, because on the evidence it is
      // usually not a failure worth reporting. Coming back to the app after a
      // while means the services have scaled to zero and the first request has to
      // wake them — two of them, serially, once the hour-long access token has
      // expired and the 401 sends us through the auth service as well. It can also
      // mean a phone that has foregrounded the app before its radio finished
      // reconnecting. Both fix themselves within seconds.
      //
      // Announcing "kunde inte synka, försöker igen automatiskt" in that moment
      // tells the user about something already in hand, and teaches them to read a
      // warning as noise. So the first attempt stays quiet and keeps the waking-up
      // indicator up; if the retry ten seconds later fails too, something is
      // actually wrong and the toast has earned its place.
      if (this.retryCount > 1) {
        this.setState({ status: "error", message: err.message, error: err });
      } else {
        this.setState({ status: "syncing", message: null, error: err });
      }
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
