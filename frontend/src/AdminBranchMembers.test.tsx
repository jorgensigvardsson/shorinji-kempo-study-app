import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminBranchMembers = vi.fn();
const adminCreateUser = vi.fn();
const adminUpdateBranch = vi.fn();
const adminOrgTree = vi.fn();
const adminUpdateDisplayName = vi.fn();
let roles: string[] = [];

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({
    adminBranchMembers, adminCreateUser, adminUpdateBranch, adminOrgTree, adminUpdateDisplayName,
    getBackendUserInfo: () => ({ roles }),
  }),
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

// The pencil on the branch heading, as distinct from the ones beside each
// member: they share a label, since each renames what it sits beside.
const branchPencil = async () => {
  const heading = await screen.findByRole("heading", { level: 1 });
  return within(heading.parentElement as HTMLElement).getByRole("button", { name: "Byt namn" });
};

describe("AdminBranchMembers", () => {
  beforeEach(() => {
    roles = [];
    adminBranchMembers.mockReset().mockResolvedValue(branch);
    adminCreateUser.mockReset().mockResolvedValue({ user: member("u3", "Cia Ceder"), notified: true });
    adminUpdateBranch.mockReset().mockResolvedValue(undefined);
    adminUpdateDisplayName.mockReset().mockResolvedValue(undefined);
    adminOrgTree.mockReset().mockResolvedValue({
      federations: [
        { id: "SE", name: "Svenska Shorinji Kempoförbundet", branches: [{ id: "b-karlstad", name: "Karlstad" }] },
        { id: "NO", name: "Norges Shorinji Kempo Forbund", branches: [] },
      ],
      wskoBranches: [],
    });
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

  // Renaming a branch and moving it to another federation used to sit beside
  // every branch on the organization overview; they live here now, on the
  // page about that branch.
  describe("changing the branch itself", () => {
    it("renames the branch and shows the name the server has", async () => {
      roles = ["branch_admin:b-karlstad"];
      const user = userEvent.setup();
      renderAt();

      await user.click(await branchPencil());
      const field = screen.getByLabelText("Namn");
      expect((field as HTMLInputElement).value).toBe("Karlstad");
      adminBranchMembers.mockResolvedValue({ ...branch, name: "Karlstads Shorinji Kempo" });
      await user.clear(field);
      await user.type(field, "Karlstads Shorinji Kempo");
      await user.click(screen.getByRole("button", { name: "Spara" }));

      expect(adminUpdateBranch).toHaveBeenCalledWith("b-karlstad", { name: "Karlstads Shorinji Kempo" });
      expect(await screen.findByRole("heading", { name: "Karlstads Shorinji Kempo" })).toBeTruthy();
    });

    // Covered through the federation as well as directly.
    it("lets the federation's admin rename it too", async () => {
      roles = ["federation_admin:SE"];
      renderAt();
      expect(await branchPencil()).toBeTruthy();
    });

    it("offers no changes to someone who covers neither the branch nor its federation", async () => {
      roles = ["federation_admin:NO", "branch_admin:b-elsewhere"];
      renderAt();
      await screen.findByText("Karlstad");
      expect(screen.queryByRole("button", { name: "Byt namn" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Byt förbund" })).toBeNull();
    });

    // A move needs authority over both where the branch is and where it is
    // going, which nobody short of WSKO has for every destination.
    it("offers a move only to someone covering WSKO", async () => {
      roles = ["federation_admin:SE"];
      renderAt();
      await screen.findByText("Karlstad");
      expect(screen.queryByRole("button", { name: "Byt förbund" })).toBeNull();
    });

    // Moving a branch out of a federation and up to WSKO is a real destination,
    // so the empty federation id is sent deliberately rather than omitted.
    it("moves the branch to WSKO once the move is confirmed", async () => {
      roles = ["wsko_admin"];
      const user = userEvent.setup();
      renderAt();

      await user.click(await screen.findByRole("button", { name: "Byt förbund" }));
      await user.selectOptions(await screen.findByLabelText("Flytta till"), "");
      await user.click(screen.getByRole("button", { name: "Flytta klubben" }));

      expect(adminUpdateBranch).toHaveBeenCalledWith("b-karlstad", { federationId: "" });
      await waitFor(() => expect(screen.queryByRole("button", { name: "Flytta klubben" })).toBeNull());
    });

    // The dialog is the whole point: opening it must not move anything, and
    // neither must confirming a destination nobody altered.
    it("moves nothing until a different federation is chosen", async () => {
      roles = ["wsko_admin"];
      const user = userEvent.setup();
      renderAt();

      await user.click(await screen.findByRole("button", { name: "Byt förbund" }));
      await screen.findByLabelText("Flytta till");
      expect((screen.getByRole("button", { name: "Flytta klubben" }) as HTMLButtonElement).disabled).toBe(true);

      await user.click(screen.getByRole("button", { name: "Avbryt" }));
      expect(adminUpdateBranch).not.toHaveBeenCalled();
    });

    it("says so plainly when the server refuses", async () => {
      roles = ["branch_admin:b-karlstad"];
      adminUpdateBranch.mockRejectedValue(new AdminRequestError(403));
      const user = userEvent.setup();
      renderAt();

      await user.click(await branchPencil());
      await user.type(screen.getByLabelText("Namn"), " Shibu");
      await user.click(screen.getByRole("button", { name: "Spara" }));

      expect(await screen.findByText("Du har inte behörighet att göra det.")).toBeTruthy();
    });
  });

  // For the member who registered under an online handle: an admin of the
  // branch gives them their real name from the list, without opening them.
  describe("renaming a member", () => {
    it("renames the member and shows the name the server has", async () => {
      roles = ["branch_admin:b-karlstad"];
      const user = userEvent.setup();
      renderAt();
      await screen.findByText("Bo Berg");

      // The branch heading has a pencil too; the members' come after it.
      const pencils = screen.getAllByRole("button", { name: "Byt namn" });
      expect(pencils).toHaveLength(3);
      await user.click(pencils[2]); // Bo Berg, second in the sorted list
      const field = screen.getByLabelText("Namn");
      expect((field as HTMLInputElement).value).toBe("Bo Berg");

      adminBranchMembers.mockResolvedValue({
        ...branch, members: [member("u2", "Bo Björk"), member("u1", "Ann Ask", ["branch_admin:b-karlstad"])],
      });
      await user.clear(field);
      await user.type(field, "Bo Björk");
      await user.click(screen.getByRole("button", { name: "Spara" }));

      expect(adminUpdateDisplayName).toHaveBeenCalledWith("u2", "Bo Björk");
      expect(await screen.findByRole("link", { name: "Bo Björk" })).toBeTruthy();
      expect(screen.queryByLabelText("Namn")).toBeNull();
    });

    // The provider would put its own name back at the next sign-in.
    it("offers no pencil for a member whose name comes from Google or Microsoft", async () => {
      roles = ["branch_admin:b-karlstad"];
      adminBranchMembers.mockResolvedValue({ ...branch, members: [{ ...member("u2", "Bo Berg"), oidc: true }] });
      renderAt();
      await screen.findByText("Bo Berg");
      // The branch heading keeps its pencil; the member gets none.
      expect(screen.getAllByRole("button", { name: "Byt namn" })).toHaveLength(1);
    });

    it("will not save an empty name or an unchanged one", async () => {
      roles = ["branch_admin:b-karlstad"];
      const user = userEvent.setup();
      renderAt();
      await screen.findByText("Bo Berg");
      await user.click(screen.getAllByRole("button", { name: "Byt namn" })[1]);

      const save = screen.getByRole("button", { name: "Spara" });
      expect(save.hasAttribute("disabled")).toBe(true);
      await user.clear(screen.getByLabelText("Namn"));
      expect(save.hasAttribute("disabled")).toBe(true);
      expect(adminUpdateDisplayName).not.toHaveBeenCalled();
    });

    it("says so plainly when the server refuses", async () => {
      roles = ["branch_admin:b-karlstad"];
      adminUpdateDisplayName.mockRejectedValue(new AdminRequestError(403));
      const user = userEvent.setup();
      renderAt();
      await screen.findByText("Bo Berg");
      await user.click(screen.getAllByRole("button", { name: "Byt namn" })[1]);
      await user.type(screen.getByLabelText("Namn"), "son");
      await user.click(screen.getByRole("button", { name: "Spara" }));

      expect(await screen.findByText("Du har inte behörighet att göra det.")).toBeTruthy();
    });
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
