// Web Push subscription helpers. These talk to the persistence backend's
// /push/* endpoints to hand out the VAPID public key and store/delete the
// browser's push subscription. See backend/persistence/internal/api/push_handlers.go.

const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080";

// Converts a base64url VAPID public key into the Uint8Array that
// PushManager.subscribe expects as applicationServerKey.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// True when the browser can do Web Push at all.
export function isPushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function fetchPublicKey(): Promise<string> {
  const resp = await fetch(`${apiUrl}/push/public-key`);
  if (!resp.ok) throw new Error(`GET /push/public-key: ${resp.status}`);
  const key = (await resp.text()).trim();
  if (!key) throw new Error("push public key not available");
  return key;
}

// Returns the active push subscription for this device, or null if none.
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// Subscribes this device to push and registers it with the backend.
// Caller is responsible for having obtained notification permission first.
export async function subscribeToPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const publicKey = await fetchPublicKey();
  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  let sub = await reg.pushManager.getSubscription();
  // If a subscription exists for a different VAPID key (e.g. the key was rotated),
  // drop it and make a fresh one so the backend can encrypt to us.
  if (sub && !applicationServerKeyMatches(sub, applicationServerKey)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  const resp = await fetch(`${apiUrl}/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // sends access_token cookie so the sub can be tied to a user
    body: JSON.stringify(sub.toJSON()),
  });
  if (!resp.ok) throw new Error(`POST /push/subscribe: ${resp.status}`);
}

// Unsubscribes this device from push and removes it from the backend.
export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  await fetch(`${apiUrl}/push/unsubscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {
    // Best effort: even if the backend call fails, drop the local subscription.
  });
  await sub.unsubscribe();
}

function applicationServerKeyMatches(sub: PushSubscription, key: Uint8Array<ArrayBuffer>): boolean {
  const existing = sub.options.applicationServerKey;
  if (!existing) return false;
  const a = new Uint8Array(existing as ArrayBuffer);
  if (a.length !== key.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== key[i]) return false;
  return true;
}
