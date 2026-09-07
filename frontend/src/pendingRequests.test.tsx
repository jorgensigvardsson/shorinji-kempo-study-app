import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminListRequests = vi.fn();
const adminListTransfers = vi.fn();
let roles: string[] = [];

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({
    adminListRequests,
    adminListTransfers,
    getBackendUserInfo: () => ({ roles }),
  }),
}));

import { forgetAdminQueue, loadAdminQueue, publishPendingRequests, setAdminQueue, usePendingRequests } from "./pendingRequests";

const Badge = () => <span data-testid="count">{usePendingRequests()}</span>;

describe("usePendingRequests", () => {
  beforeEach(() => {
    roles = ["branch_admin:b-karlstad"];
    adminListRequests.mockReset().mockResolvedValue([{ email: "a@example.org" }]);
    adminListTransfers.mockReset().mockResolvedValue([{ id: "u1" }]);
    publishPendingRequests(0);
    forgetAdminQueue();
  });

  // Both kinds of request count: an admin has one queue, not two.
  it("counts who is waiting on an admin", async () => {
    render(<Badge />);
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("2"));
  });

  // Nobody else is asked: a member has no queue, and the request would only be
  // refused.
  it("asks nothing of somebody with no admin role", async () => {
    roles = [];
    render(<Badge />);
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("0"));
    expect(adminListRequests).not.toHaveBeenCalled();
  });

  // The queue page is the one place that knows the true figure, so what it
  // reports wins over what the badge fetched for itself.
  it("takes correction from whoever has actually read the queue", async () => {
    render(<Badge />);
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("2"));

    publishPendingRequests(1);
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
  });

  // A badge is not worth an error message; the queue page says so properly.
  it("stays quiet when the count cannot be fetched", async () => {
    adminListRequests.mockRejectedValue(new Error("offline"));
    render(<Badge />);
    await waitFor(() => expect(adminListRequests).toHaveBeenCalled());
    expect(screen.getByTestId("count").textContent).toBe("0");
  });
});

// The menu and the queue page want the same two lists at the same moment, and a
// per-IP budget shared by a whole household cannot afford to be asked twice for
// one answer. This is the fix for the rate limiting that made approving a member
// fail on 2026-09-06.
describe("loadAdminQueue", () => {
  beforeEach(() => {
    adminListRequests.mockReset().mockResolvedValue([{ email: "a@example.org" }]);
    adminListTransfers.mockReset().mockResolvedValue([{ id: "u1" }]);
    forgetAdminQueue();
    publishPendingRequests(0);
  });

  it("asks once for two readers arriving together", async () => {
    const [first, second] = await Promise.all([loadAdminQueue(), loadAdminQueue()]);

    expect(adminListRequests).toHaveBeenCalledTimes(1);
    expect(adminListTransfers).toHaveBeenCalledTimes(1);
    expect(second).toBe(first); // the very same reading, not an equal one
  });

  it("serves a reading taken a moment ago rather than taking another", async () => {
    await loadAdminQueue();
    await loadAdminQueue();
    expect(adminListRequests).toHaveBeenCalledTimes(1);
  });

  it("goes and looks again when asked for the truth", async () => {
    await loadAdminQueue();
    await loadAdminQueue({ fresh: true });
    expect(adminListRequests).toHaveBeenCalledTimes(2);
  });

  // Whoever decided a request knows it is gone; sending them to ask would spend
  // two calls to be told what they just did.
  it("takes the decider's word for what is left", async () => {
    await loadAdminQueue();
    setAdminQueue({ requests: [], transfers: [] });

    const queue = await loadAdminQueue();
    expect(queue.requests).toEqual([]);
    expect(adminListRequests).toHaveBeenCalledTimes(1);
  });

  // A failed reading must not be remembered as one, or the failure outlives the
  // outage that caused it.
  it("does not cache a fetch that failed", async () => {
    adminListRequests.mockRejectedValueOnce(new Error("offline"));
    await expect(loadAdminQueue()).rejects.toThrow("offline");

    await loadAdminQueue();
    expect(adminListRequests).toHaveBeenCalledTimes(2);
  });
});
