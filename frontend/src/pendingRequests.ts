import { useEffect, useState } from "react";
import { getSyncManager } from "./sync/manager";
import { isAnyAdmin } from "./roles";

// How many people are waiting on this admin's decision, kept where the menu can
// see it. A request nobody notices is a request that rots: somebody applies,
// nothing visibly happens, and the only sign is an email that was read on a
// phone three weeks ago.
//
// The count is a courtesy rather than a source of truth — it is stale the moment
// another admin decides something, and it is allowed to be. Anything that reads
// the queue for real reports back through `publishPendingRequests`, so the badge
// settles on the truth as soon as anyone looks.

let current = 0;
const listeners = new Set<(count: number) => void>();

export function publishPendingRequests(count: number): void {
  current = count;
  for (const listener of listeners) listener(count);
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
    let live = true;
    void (async () => {
      try {
        const waiting = await getSyncManager().adminListRequests();
        if (live) publishPendingRequests(waiting.length);
      } catch {
        // A badge is not worth an error message. The queue page says so properly
        // when it cannot reach the server.
      }
    })();
    return () => { live = false; };
  }, [rolesKey]);

  return count;
}
