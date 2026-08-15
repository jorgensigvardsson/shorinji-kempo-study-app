// Whether this device is signed in, and to what.
//
// This used to live in the synced app-data document, which was circular: the document
// only exists on the server when signed in, so "am I signed in" was being stored inside
// the thing that being signed in gives you. It also meant signing out on one device
// wrote a change that the merge then had to reason about on every other device — a
// scalar it could raise a conflict prompt about, for a value that was never anyone
// else's business.
//
// It is per-device state, so it lives per device.
export type SyncProvider = "local" | "backend";

const storageKey = "sync-provider";
// Where it used to live, read once so a signed-in device stays signed in across the
// upgrade rather than being bounced back to the login screen.
const legacyDocumentKey = "app-data-document";

type Listener = (provider: SyncProvider) => void;

let current: SyncProvider | null = null;
let nextListenerId = 0;
const listeners = new Map<number, Listener>();

// Documents written before cloud-storage sync was removed can still name a provider we
// no longer have ("onedrive", "google-drive", "dropbox"); those read as signed out.
function isSyncProvider(value: unknown): value is SyncProvider {
  return value === "local" || value === "backend";
}

function read(): SyncProvider {
  const stored = localStorage.getItem(storageKey);
  if (isSyncProvider(stored)) return stored;

  // Nothing here yet: adopt whatever the document said before this moved out of it.
  // Read from the raw stored document rather than through the store, because the store
  // drops retired fields as it loads and would have thrown this away already.
  try {
    const legacy = JSON.parse(localStorage.getItem(legacyDocumentKey) ?? "null") as
      { data?: { syncProvider?: unknown } } | null;
    if (isSyncProvider(legacy?.data?.syncProvider)) {
      localStorage.setItem(storageKey, legacy.data.syncProvider);
      return legacy.data.syncProvider;
    }
  } catch {
    // A malformed legacy document just means starting signed out.
  }
  return "local";
}

export function getSyncProvider(): SyncProvider {
  if (current === null) current = read();
  return current;
}

export function setSyncProvider(provider: SyncProvider): void {
  if (getSyncProvider() === provider) return;
  current = provider;
  localStorage.setItem(storageKey, provider);
  for (const listener of listeners.values()) listener(provider);
}

export function subscribeSyncProvider(listener: Listener): () => void {
  const id = nextListenerId++;
  listeners.set(id, listener);
  return () => { listeners.delete(id); };
}

// Test seam: the module caches the value, which would otherwise persist between tests.
export function resetSyncProviderCache(): void {
  current = null;
}
