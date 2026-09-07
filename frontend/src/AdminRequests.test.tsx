import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminListRequests = vi.fn();
const adminDecideRequest = vi.fn();
const adminListTransfers = vi.fn();
const adminDecideTransfer = vi.fn();

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({ adminListRequests, adminDecideRequest, adminListTransfers, adminDecideTransfer }),
}));

import AdminRequests from "./AdminRequests";
import { forgetAdminQueue } from "./pendingRequests";
import { AdminRequestError } from "./sync/backend";

const waiting = [
  {
    email: "hopeful@example.org", name: "Hopeful Person", note: "Tränar på tisdagar",
    branchId: "karlstad", branchName: "Karlstad", createdAt: "2026-08-26T00:00:00Z",
  },
  {
    email: "again@example.org", name: "Second Time", branchId: "karlstad", branchName: "Karlstad",
    createdAt: "2026-08-26T01:00:00Z", previouslyDeniedAt: "2026-05-01T00:00:00Z",
  },
];

describe("AdminRequests", () => {
  beforeEach(() => {
    adminListRequests.mockReset().mockResolvedValue(waiting);
    adminDecideRequest.mockReset().mockResolvedValue(undefined);
    adminListTransfers.mockReset().mockResolvedValue([]);
    adminDecideTransfer.mockReset().mockResolvedValue(undefined);
    forgetAdminQueue();
  });

  it("shows who is waiting, in their own words", async () => {
    render(<AdminRequests />);
    expect(await screen.findByText("Hopeful Person")).toBeTruthy();
    expect(screen.getByText("hopeful@example.org")).toBeTruthy();
    expect(screen.getByText("Tränar på tisdagar")).toBeTruthy();
  });

  // A re-application is not the same question as a first one, and the admin
  // should know that before deciding rather than after.
  it("marks an applicant who has been declined before", async () => {
    render(<AdminRequests />);
    expect(await screen.findByText("Har nekats tidigare")).toBeTruthy();
    // And only that one — the first applicant has no such history.
    expect(screen.getAllByText("Har nekats tidigare")).toHaveLength(1);
  });

  it("approves in one click and drops the request from the list", async () => {
    const user = userEvent.setup();
    render(<AdminRequests />);
    await screen.findByText("Hopeful Person");

    await user.click(screen.getAllByRole("button", { name: "Godkänn" })[0]);

    await waitFor(() => expect(adminDecideRequest).toHaveBeenCalledWith("hopeful@example.org", true));
    await waitFor(() => expect(screen.queryByText("Hopeful Person")).toBeNull());
    expect(screen.getByText("Second Time")).toBeTruthy();
  });

  // Approving is recoverable — the member can be removed later — while a denial
  // sends a message nobody can unsend, so it asks first.
  it("asks before declining", async () => {
    const user = userEvent.setup();
    render(<AdminRequests />);
    await screen.findByText("Hopeful Person");

    await user.click(screen.getAllByRole("button", { name: "Neka" })[0]);
    expect(adminDecideRequest).not.toHaveBeenCalled();
    expect(screen.getByText("Neka ansökan?")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Ja, neka" }));
    await waitFor(() => expect(adminDecideRequest).toHaveBeenCalledWith("hopeful@example.org", false));
  });

  it("lets a confirmation be called off", async () => {
    const user = userEvent.setup();
    render(<AdminRequests />);
    await screen.findByText("Hopeful Person");

    await user.click(screen.getAllByRole("button", { name: "Neka" })[0]);
    await user.click(screen.getByRole("button", { name: "Avbryt" }));

    expect(adminDecideRequest).not.toHaveBeenCalled();
    expect(screen.queryByText("Neka ansökan?")).toBeNull();
  });

  it("says plainly when nobody is waiting", async () => {
    adminListRequests.mockResolvedValue([]);
    render(<AdminRequests />);
    expect(await screen.findByText("Inga ansökningar väntar.")).toBeTruthy();
  });

  // Every refusal used to read the same: "the decision could not be saved".
  // That sentence covered a rate limit, an application somebody else had already
  // decided, and a genuine fault — three situations asking opposite things of
  // whoever was reading it.
  describe("when the server says no", () => {
    it("tries a rate-limited decision once more before saying anything", async () => {
      adminDecideRequest
        .mockRejectedValueOnce(new AdminRequestError(429))
        .mockResolvedValueOnce(undefined);
      const user = userEvent.setup();
      render(<AdminRequests />);
      await screen.findByText("Hopeful Person");

      await user.click(screen.getAllByRole("button", { name: "Godkänn" })[0]);

      // The admin neither caused the refusal nor could act on it, so it never
      // reaches her: the row simply goes, a moment later than it would have.
      expect(await screen.findByText("Second Time")).toBeTruthy();
      await waitFor(() => expect(screen.queryByText("Hopeful Person")).toBeNull(), { timeout: 3000 });
      expect(adminDecideRequest).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/kunde inte sparas/)).toBeNull();
    });

    it("says to wait when the retry is refused too", async () => {
      adminDecideRequest.mockRejectedValue(new AdminRequestError(429));
      const user = userEvent.setup();
      render(<AdminRequests />);
      await screen.findByText("Hopeful Person");

      await user.click(screen.getAllByRole("button", { name: "Godkänn" })[0]);

      expect(await screen.findByText("För många på kort tid. Vänta en stund och försök igen.", {}, { timeout: 3000 })).toBeTruthy();
      // The applicant is still waiting, and the row still says so.
      expect(screen.getByText("Hopeful Person")).toBeTruthy();
      // Asking again is exactly what the situation cannot afford.
      expect(adminListRequests).toHaveBeenCalledTimes(1);
    });

    // Two admins share a branch, and one of them gets there first.
    it("re-reads the queue when a request has already been decided", async () => {
      adminDecideRequest.mockRejectedValue(new AdminRequestError(404));
      adminListRequests.mockResolvedValueOnce(waiting).mockResolvedValue([waiting[1]]);
      const user = userEvent.setup();
      render(<AdminRequests />);
      await screen.findByText("Hopeful Person");

      await user.click(screen.getAllByRole("button", { name: "Godkänn" })[0]);

      expect(await screen.findByText("Ansökan finns inte längre — någon annan kan ha hunnit före.")).toBeTruthy();
      // And the row it refers to goes, rather than staying to be clicked again
      // until somebody reloads the whole page.
      await waitFor(() => expect(screen.queryByText("Hopeful Person")).toBeNull());
      expect(screen.getByText("Second Time")).toBeTruthy();
    });

    it("still says plainly when nothing else explains it", async () => {
      adminDecideRequest.mockRejectedValue(new Error("offline"));
      const user = userEvent.setup();
      render(<AdminRequests />);
      await screen.findByText("Hopeful Person");

      await user.click(screen.getAllByRole("button", { name: "Godkänn" })[0]);

      expect(await screen.findByText("Beslutet kunde inte sparas. Försök igen.")).toBeTruthy();
      expect(screen.getByText("Hopeful Person")).toBeTruthy();
    });
  });
  it("offers a retry when the listing cannot be fetched", async () => {
    adminListRequests.mockRejectedValue(new Error("offline"));
    render(<AdminRequests />);

    expect(await screen.findByText("Kunde inte hämta ansökningarna.")).toBeTruthy();
    adminListRequests.mockResolvedValue(waiting);
    await userEvent.setup().click(screen.getByRole("button", { name: "Försök igen" }));
    expect(await screen.findByText("Hopeful Person")).toBeTruthy();
  });
});

// A member who has moved is not a stranger at the door, and the two are read
// differently — but they are decided the same way, on the same page, because an
// admin has one queue rather than two.
describe("AdminRequests, transfers", () => {
  const moving = [{
    id: "u1", memberName: "Moved Person", memberEmail: "moved@example.org",
    fromBranchId: "b-oslo", fromBranchName: "Oslo",
    toBranchId: "b-karlstad", toBranchName: "Karlstad",
    note: "Har flyttat till Karlstad", createdAt: "2026-08-26T00:00:00Z",
  }];

  beforeEach(() => {
    adminListRequests.mockReset().mockResolvedValue([]);
    adminDecideRequest.mockReset().mockResolvedValue(undefined);
    adminListTransfers.mockReset().mockResolvedValue(moving);
    adminDecideTransfer.mockReset().mockResolvedValue(undefined);
    forgetAdminQueue();
  });

  it("says where a transferring member is coming from", async () => {
    render(<AdminRequests />);
    expect(await screen.findByText("Moved Person")).toBeTruthy();
    expect(screen.getByText("Oslo → Karlstad")).toBeTruthy();
    expect(screen.getByText("Har flyttat till Karlstad")).toBeTruthy();
    expect(screen.getByText("Byte av klubb")).toBeTruthy();
  });

  it("accepts a transfer in one click", async () => {
    const user = userEvent.setup();
    render(<AdminRequests />);
    await screen.findByText("Moved Person");

    await user.click(screen.getByRole("button", { name: "Godkänn" }));

    await waitFor(() => expect(adminDecideTransfer).toHaveBeenCalledWith("u1", true));
    await waitFor(() => expect(screen.queryByText("Moved Person")).toBeNull());
    expect(adminDecideRequest).not.toHaveBeenCalled();
  });

  // A refusal sends a message nobody can unsend, whichever kind of request it is.
  it("asks before refusing a transfer", async () => {
    const user = userEvent.setup();
    render(<AdminRequests />);
    await screen.findByText("Moved Person");

    await user.click(screen.getByRole("button", { name: "Neka" }));
    expect(adminDecideTransfer).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Ja, neka" }));
    await waitFor(() => expect(adminDecideTransfer).toHaveBeenCalledWith("u1", false));
  });

  it("shows both kinds under their own headings", async () => {
    adminListRequests.mockResolvedValue([{
      email: "hopeful@example.org", name: "Hopeful Person",
      branchId: "b-karlstad", branchName: "Karlstad", createdAt: "2026-08-26T00:00:00Z",
    }]);
    render(<AdminRequests />);

    expect(await screen.findByText("Nya medlemmar")).toBeTruthy();
    expect(screen.getByText("Byte av klubb")).toBeTruthy();
    expect(screen.getByText("Hopeful Person")).toBeTruthy();
    expect(screen.getByText("Moved Person")).toBeTruthy();
  });

  it("says nothing is waiting only when neither kind is", async () => {
    adminListTransfers.mockResolvedValue([]);
    render(<AdminRequests />);
    expect(await screen.findByText("Inga ansökningar väntar.")).toBeTruthy();
  });
});
