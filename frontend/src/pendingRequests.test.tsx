import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminListRequests = vi.fn();
let roles: string[] = [];

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({
    adminListRequests,
    getBackendUserInfo: () => ({ roles }),
  }),
}));

import { publishPendingRequests, usePendingRequests } from "./pendingRequests";

const Badge = () => <span data-testid="count">{usePendingRequests()}</span>;

describe("usePendingRequests", () => {
  beforeEach(() => {
    roles = ["branch_admin:b-karlstad"];
    adminListRequests.mockReset().mockResolvedValue([{ email: "a@example.org" }, { email: "b@example.org" }]);
    publishPendingRequests(0);
  });

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
