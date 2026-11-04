import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listBranches = vi.fn();
const adminOrgTree = vi.fn();
const adminRenameFederation = vi.fn();
const adminCreateBranch = vi.fn();
let roles: string[] | null = null; // null: nobody signed in

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({
    listBranches, adminOrgTree, adminRenameFederation, adminCreateBranch,
    getBackendUserInfo: () => (roles === null ? null : { roles }),
  }),
}));

import AdminFederation from "./AdminFederation";
import { AdminRequestError } from "./sync/backend";

const SE = "Svenska Shorinji Kempoförbundet";
const publicBranches = [
  { id: "b-karlstad", name: "Karlstad", federationId: "SE", federationName: SE },
  { id: "b-goteborg", name: "Göteborg", federationId: "SE", federationName: SE },
  { id: "b-oslo", name: "Oslo", federationId: "NO", federationName: "Norges Shorinji Kempo Forbund" },
];

const renderAt = (id = "SE") =>
  render(
    <MemoryRouter initialEntries={[`/admin/federations/${id}`]}>
      <Routes>
        <Route path="/admin/federations/:id" element={<AdminFederation />} />
        <Route path="/admin/branches/:id/members" element={<p>members page</p>} />
      </Routes>
    </MemoryRouter>);

describe("AdminFederation", () => {
  beforeEach(() => {
    roles = null;
    listBranches.mockReset().mockResolvedValue(publicBranches);
    adminOrgTree.mockReset().mockResolvedValue({
      federations: [{ id: "SE", name: SE, branches: [{ id: "b-karlstad", name: "Karlstad" }, { id: "b-goteborg", name: "Göteborg" }] }],
      wskoBranches: [],
    });
    adminRenameFederation.mockReset().mockResolvedValue(undefined);
    adminCreateBranch.mockReset().mockResolvedValue("b-new");
  });

  it("names the federation and lists its branches, and only its own", async () => {
    renderAt();
    expect(await screen.findByRole("heading", { name: SE })).toBeTruthy();
    expect(screen.getByText("Karlstad")).toBeTruthy();
    expect(screen.getByText("Göteborg")).toBeTruthy();
    expect(screen.queryByText("Oslo")).toBeNull();
  });

  // As public as the organization overview, and just as read-only for
  // somebody with no say over it.
  it("offers nothing to change, and no branch to open, to somebody without a role", async () => {
    renderAt();
    await screen.findByText("Karlstad");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link", { name: "Karlstad" })).toBeNull();
  });

  // A branch admin sees their federation like anybody does and may open their
  // own branch, but changing the federation is a federation-level act.
  it("lets a branch admin open their branch but not change the federation", async () => {
    roles = ["branch_admin:b-karlstad"];
    renderAt();
    await screen.findByText("Karlstad");
    expect(screen.getByRole("link", { name: "Karlstad" }).getAttribute("href")).toBe("/admin/branches/b-karlstad/members");
    expect(screen.queryByRole("link", { name: "Göteborg" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Byt namn" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ny klubb" })).toBeNull();
  });

  it("renames the federation for its admin", async () => {
    roles = ["federation_admin:SE"];
    const user = userEvent.setup();
    renderAt();

    await user.click(await screen.findByRole("button", { name: "Byt namn" }));
    const field = screen.getByLabelText("Namn");
    expect((field as HTMLInputElement).value).toBe(SE);
    await user.clear(field);
    await user.type(field, "Svenska Shorinji Kempo Förbundet");
    await user.click(screen.getByRole("button", { name: "Spara" }));

    await waitFor(() => expect(adminRenameFederation).toHaveBeenCalledWith("SE", "Svenska Shorinji Kempo Förbundet"));
    // Reloaded rather than patched: the public list is asked again.
    await waitFor(() => expect(listBranches).toHaveBeenCalledTimes(2));
  });

  // A new branch has nobody in it yet, and its own page is where they are added.
  it("adds a branch to this federation and opens it", async () => {
    roles = ["federation_admin:SE"];
    const user = userEvent.setup();
    renderAt();

    await user.click(await screen.findByRole("button", { name: "Ny klubb" }));
    await user.type(screen.getByLabelText("Klubbens namn"), "Arvika");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));

    expect(adminCreateBranch).toHaveBeenCalledWith("Arvika", "SE");
    expect(await screen.findByText("members page")).toBeTruthy();
  });

  it("says so plainly when the server refuses", async () => {
    roles = ["federation_admin:SE"];
    adminCreateBranch.mockRejectedValue(new AdminRequestError(403));
    const user = userEvent.setup();
    renderAt();

    await user.click(await screen.findByRole("button", { name: "Ny klubb" }));
    await user.type(screen.getByLabelText("Klubbens namn"), "Arvika");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));

    expect(await screen.findByText("Du har inte behörighet att göra det.")).toBeTruthy();
  });

  // A federation with no branch is not in the public list, so only somebody
  // covering it finds it here; for anybody else it is not there.
  it("shows an empty federation to its admin", async () => {
    roles = ["federation_admin:NO"];
    adminOrgTree.mockResolvedValue({ federations: [{ id: "DK", name: "Dansk Shorinji Kempo Forbund", branches: [] }], wskoBranches: [] });
    renderAt("DK");
    expect(await screen.findByText("Inga klubbar här.")).toBeTruthy();
  });

  it("treats a federation it cannot find as one that is not there", async () => {
    renderAt("XX");
    expect(await screen.findByText("Det här förbundet finns inte, eller så har du inte behörighet till det.")).toBeTruthy();
  });
});
