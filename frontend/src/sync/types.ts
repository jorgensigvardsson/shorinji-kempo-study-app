export type SyncStatus = "local_only" | "disconnected" | "connected" | "syncing" | "error" | "auth_expired" | "conflict_resolution" | "client_outdated" | "document_too_large";

export class AuthExpiredError extends Error {
  constructor() {
    super("Auth token expired and could not be refreshed.");
    this.name = "AuthExpiredError";
  }
}

// The server refused a document write because another device wrote first, so the
// merge behind it was computed against a version that is no longer current. Not an
// error the user needs to see: the fix is to read again, merge again, and retry.
export class DocumentChangedError extends Error {
  constructor() {
    super("The document changed on the server since it was read.");
    this.name = "DocumentChangedError";
  }
}

// The server refused the write because this build predates the shape the document is
// stored in, and writing it back would drop the fields this build cannot see. Unlike
// a stale write there is nothing to retry: the app itself has to be updated first.
export class ClientOutdatedError extends Error {
  constructor(readonly requiredSchemaVersion: number) {
    super(`The stored document uses schema version ${requiredSchemaVersion}, which this build does not understand.`);
    this.name = "ClientOutdatedError";
  }
}

// The document has outgrown what the server will accept. Like ClientOutdatedError
// there is nothing to retry — the same bytes will be refused every time — but unlike
// it, no reload fixes this: the document has to get smaller. Nothing is lost when it
// happens, because every change is already saved on this device; what stops is the
// copy reaching the user's other devices.
export class DocumentTooLargeError extends Error {
  constructor(readonly bytes: number, readonly limitBytes: number) {
    super(`The document is ${bytes} bytes, over the ${limitBytes} byte limit the server accepts.`);
    this.name = "DocumentTooLargeError";
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
