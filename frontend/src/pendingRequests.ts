import { useEffect, useState } from "react";
import { getSyncManager } from "./sync/manager";
import { isAnyAdmin } from "./roles";
import type { AdminJoinRequest, AdminTransfer } from "./sync/backend";

// Everybody waiting on this admin: people asking to be let in, and members asking
// to transfer in. Two readers want the same two lists — the menu, to put a number
// on them, and the queue page, to show them — so the fetch lives here and they
// share it.
//
// A request nobody notices is a request that rots: somebody applies, nothing
// visibly happens, and the only sign is an email read on a phone three weeks ago.
// Hence the badge.
//
// The count is a courtesy rather than a source of truth — it is stale the moment
// another admin decides something, and it is allowed to be. Anything that reads
// the queue for real reports back through `publishPendingRequests`, so the badge
// settles on the truth as soon as anyone looks.

export interface AdminQueue {
  requests: AdminJoinRequest[];
  transfers: AdminTransfer[];
}

let current = 0;
const listeners = new Set<(count: number) => void>();

export function publishPendingRequests(count: number): void {
  current = count;
  for (const listener of listeners) listener(count);
}

// The last reading, and any fetch still in the air. Both exist for the same
// reason: opening the queue page used to cost four requests where two would do —
// the menu asking on one side, the page asking on the other, at the same instant
// on a cold start — against a per-IP budget that could not afford it.
let cached: { at: number; queue: AdminQueue } | null = null;
let inFlight: Promise<AdminQueue> | null = null;

// How long a reading may stand in for a fresh one. Long enough to cover a page
// opening behind the menu that just counted it; short enough that nobody is
// looking at it. Anything that needs the truth asks for it — see `fresh`.
const FRESH_MS = 15_000;

// Reads the queue, reusing a reading taken moments ago and joining one already in
// flight rather than starting a second. `fresh` skips both, which is what to pass
// after acting on a request: the copy in hand is then known to be wrong.
export async function loadAdminQueue(options?: { fresh?: boolean }): Promise<AdminQueue> {
  if (options?.fresh === true) {
    cached = null;
  } else {
    if (cached !== null && Date.now() - cached.at < FRESH_MS) return cached.queue;
    if (inFlight !== null) return inFlight;
  }

  const fetching = (async () => {
    const [requests, transfers] = await Promise.all([
      getSyncManager().adminListRequests(),
      getSyncManager().adminListTransfers(),
    ]);
    const queue: AdminQueue = { requests, transfers };
    setAdminQueue(queue);
    return queue;
  })();
  inFlight = fetching.finally(() => { inFlight = null; });
  return inFlight;
}

// Records what the queue now holds without going and asking. Deciding a request
// removes it, and the decider is the one person who knows that for certain — so
// they say so here, and the next reader is not handed back the row that has just
// been dealt with.
export function setAdminQueue(queue: AdminQueue): void {
  cached = { at: Date.now(), queue };
  publishPendingRequests(queue.requests.length + queue.transfers.length);
}

// Tests share one module instance, and a reading cached by one of them would
// otherwise be served to the next.
export function forgetAdminQueue(): void {
  cached = null;
  inFlight = null;
}

export function usePendingRequests(): number {
  const roles = getSyncManager().getBackendUserInfo()?.roles ?? [];
  // Roles arrive after the session settles, so the fetch waits for them rather
  // than firing once against an empty list and never asking again.
  const rolesKey = roles.join(",");

  const [count, setCount] = useState(current);

  useEffect(() => {
    listeners.add(setCount);
    return () => { listeners.delete(setCount); };
  }, []);

  useEffect(() => {
    if (!isAnyAdmin(rolesKey === "" ? [] : rolesKey.split(","))) return;
    void loadAdminQueue().catch(() => {
      // A badge is not worth an error message. The queue page says so properly
      // when it cannot reach the server.
    });
  }, [rolesKey]);

  return count;
}
