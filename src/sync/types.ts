export type SyncStatus = "local_only" | "disconnected" | "connecting" | "connected" | "syncing" | "error";

export interface SyncState {
  status: SyncStatus;
  message: string | null;
  lastSyncedAt: string | null;
  lastConflictResolutionAt: string | null;
}

export interface SyncResult {
  conflictDetected: boolean;
  pushedLocalChanges: boolean;
}
