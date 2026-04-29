export type SyncStatus = "local_only" | "disconnected" | "connecting" | "connected" | "syncing" | "error" | "auth_expired";

export class AuthExpiredError extends Error {
  constructor() {
    super("Auth token expired and could not be refreshed.");
    this.name = "AuthExpiredError";
  }
}

export interface SyncState {
  status: SyncStatus;
  message: string | null;
  error: Error | null;
  lastSyncedAt: string | null;
  lastConflictResolutionAt: string | null;
}

export interface SyncResult {
  conflictDetected: boolean;
  pushedLocalChanges: boolean;
}
