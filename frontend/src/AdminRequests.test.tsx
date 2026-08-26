import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminListRequests = vi.fn();
const adminDecideRequest = vi.fn();

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({ adminListRequests, adminDecideRequest }),
}));

import AdminRequests from "./AdminRequests";

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

  it("offers a retry when the listing cannot be fetched", async () => {
    adminListRequests.mockRejectedValue(new Error("offline"));
    render(<AdminRequests />);

    expect(await screen.findByText("Kunde inte hämta ansökningarna.")).toBeTruthy();
    adminListRequests.mockResolvedValue(waiting);
    await userEvent.setup().click(screen.getByRole("button", { name: "Försök igen" }));
    expect(await screen.findByText("Hopeful Person")).toBeTruthy();
  });
});
