import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminBranchMembers = vi.fn();

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({ adminBranchMembers }),
}));

import AdminBranchMembers from "./AdminBranchMembers";
import { AdminRequestError } from "./sync/backend";

const member = (id: string, displayName: string, roles: string[] = []) => ({
  id, displayName, email: `${id}@example.org`, roles,
  linkedIdentities: {}, oidc: false, createdAt: "", lastLoginAt: "", branchId: "b-karlstad",
});

const branch = {
  id: "b-karlstad", name: "Karlstad", federationId: "SE",
  members: [member("u2", "Bo Berg"), member("u1", "Ann Ask", ["branch_admin:b-karlstad"])],
};

const renderAt = (id = "b-karlstad") =>
  render(
    <MemoryRouter initialEntries={[`/admin/branches/${id}/members`]}>
      <Routes>
        <Route path="/admin/branches/:id/members" element={<AdminBranchMembers />} />
      </Routes>
    </MemoryRouter>);

describe("AdminBranchMembers", () => {
  beforeEach(() => {
    adminBranchMembers.mockReset().mockResolvedValue(branch);
  });

  it("names the branch and lists its members by name", async () => {
    renderAt();
    expect(await screen.findByText("Karlstad")).toBeTruthy();
    expect(adminBranchMembers).toHaveBeenCalledWith("b-karlstad");
    const names = screen.getAllByRole("link").map(a => a.textContent);
    expect(names).toEqual(["Ann Ask", "Bo Berg"]); // sorted, not in arrival order
  });

  it("points each member at their own page", async () => {
    renderAt();
    const link = await screen.findByRole("link", { name: "Ann Ask" });
    expect(link.getAttribute("href")).toBe("/admin/users/u1");
  });

  it("says who administers the branch", async () => {
    renderAt();
    expect(await screen.findByText("Klubbadministratör")).toBeTruthy();
    expect(screen.getAllByText("Klubbadministratör")).toHaveLength(1);
  });

  // A branch outside the caller's authority answers 404, exactly as one that does
  // not exist — so there is a single message, and the page does not pretend to
  // know which case it is in.
  it("treats a branch it may not see as one that is not there", async () => {
    adminBranchMembers.mockRejectedValue(new AdminRequestError(404));
    renderAt("someone-elses");
    expect(await screen.findByText("Den här klubben finns inte, eller så har du inte behörighet till den.")).toBeTruthy();
  });

  it("offers a retry when the listing cannot be fetched", async () => {
    adminBranchMembers.mockRejectedValue(new Error("offline"));
    renderAt();

    expect(await screen.findByText("Kunde inte hämta medlemmarna.")).toBeTruthy();
    adminBranchMembers.mockResolvedValue(branch);
    await userEvent.setup().click(screen.getByRole("button", { name: "Försök igen" }));
    expect(await screen.findByText("Bo Berg")).toBeTruthy();
  });

  it("says plainly when a branch has nobody in it yet", async () => {
    adminBranchMembers.mockResolvedValue({ ...branch, members: [] });
    renderAt();
    expect(await screen.findByText("Klubben har inga medlemmar ännu.")).toBeTruthy();
  });
});
