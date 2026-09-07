import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminBranchMembers = vi.fn();
const adminCreateUser = vi.fn();

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({ adminBranchMembers, adminCreateUser }),
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
    adminCreateUser.mockReset().mockResolvedValue({ user: member("u3", "Cia Ceder"), notified: true });
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

  describe("adding a member by hand", () => {
    // Opens the form and fills it in, which every test below starts with.
    const fillIn = async (name: string, email: string) => {
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: "Lägg till medlem" }));
      await user.type(screen.getByLabelText("Namn"), name);
      await user.type(screen.getByLabelText("E-post"), email);
      return user;
    };

    it("adds the member to the branch being looked at, and says they were told", async () => {
      renderAt();
      const user = await fillIn("Cia Ceder", "cia@example.org");
      await user.click(screen.getByRole("button", { name: "Lägg till" }));

      // The branch comes from the page's own url, not from anything typed, and
      // the language is the admin's — the only guess going for somebody who has
      // never opened the app.
      expect(adminCreateUser).toHaveBeenCalledWith("b-karlstad", "cia@example.org", "Cia Ceder", "sv");
      expect(await screen.findByText(/har lagts till och har fått ett mejl om kontot\./)).toBeTruthy();
      // Reloaded rather than patched in: the list is sorted and the server owns
      // the ids.
      expect(adminBranchMembers).toHaveBeenCalledTimes(2);
    });

    // The account exists either way, so the admin is told which case they are in
    // — they are the only one who can pick up the phone instead.
    it("warns when the account was made but the message did not get out", async () => {
      adminCreateUser.mockResolvedValue({ user: member("u3", "Cia Ceder"), notified: false });
      renderAt();
      const user = await fillIn("Cia Ceder", "cia@example.org");
      await user.click(screen.getByRole("button", { name: "Lägg till" }));

      expect(await screen.findByText(/mejlet om kontot kunde inte skickas/)).toBeTruthy();
    });

    it("says which refusal it was, so the admin knows what to change", async () => {
      adminCreateUser.mockRejectedValue(new AdminRequestError(409, "account_exists"));
      renderAt();
      const user = await fillIn("Cia Ceder", "cia@example.org");
      await user.click(screen.getByRole("button", { name: "Lägg till" }));

      expect(await screen.findByText("Den e-postadressen har redan ett konto.")).toBeTruthy();
      // The form stays open with what was typed still in it: the address is the
      // one thing worth correcting, and retyping the name to do it is a tax.
      expect(screen.getByLabelText("E-post").getAttribute("value")).toBe("cia@example.org");
    });

    it("will not send a half-filled form", async () => {
      renderAt();
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: "Lägg till medlem" }));
      await user.type(screen.getByLabelText("Namn"), "Cia Ceder");

      expect(screen.getByRole("button", { name: "Lägg till" }).hasAttribute("disabled")).toBe(true);
      expect(adminCreateUser).not.toHaveBeenCalled();
    });
  });
});
