import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listBranches = vi.fn();
const adminOrgTree = vi.fn();
const adminCreateFederation = vi.fn();
const adminCreateBranch = vi.fn();
let roles: string[] | null = null; // null: nobody signed in

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({
    listBranches, adminOrgTree, adminCreateFederation, adminCreateBranch,
    getBackendUserInfo: () => (roles === null ? null : { roles }),
  }),
}));

import AdminWSKO from "./AdminWSKO";
import { AdminRequestError } from "./sync/backend";

const publicBranches = [
  { id: "b-karlstad", name: "Karlstad", federationId: "SE", federationName: "Svenska Shorinji Kempoförbundet" },
  { id: "b-tokyo", name: "Tokyo Honbu" },
];

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/admin/wsko"]}>
      <Routes>
        <Route path="/admin/wsko" element={<AdminWSKO />} />
        <Route path="/admin/federations/:id" element={<p>federation page</p>} />
        <Route path="/admin/branches/:id/members" element={<p>members page</p>} />
      </Routes>
    </MemoryRouter>);

describe("AdminWSKO", () => {
  beforeEach(() => {
    roles = null;
    listBranches.mockReset().mockResolvedValue(publicBranches);
    adminOrgTree.mockReset().mockResolvedValue({ federations: [], wskoBranches: [] });
    adminCreateFederation.mockReset().mockResolvedValue("DK");
    adminCreateBranch.mockReset().mockResolvedValue("b-new");
  });

  it("lists the federations, each linking to its page, and the branches directly under WSKO", async () => {
    renderPage();
    const federation = await screen.findByRole("link", { name: "Svenska Shorinji Kempoförbundet" });
    expect(federation.getAttribute("href")).toBe("/admin/federations/SE");
    expect(screen.getByText("Tokyo Honbu")).toBeTruthy();
    // Karlstad belongs to its federation, not here.
    expect(screen.queryByText("Karlstad")).toBeNull();
  });

  it("offers nothing to change, and no branch to open, to somebody who does not cover WSKO", async () => {
    roles = ["federation_admin:SE"];
    renderPage();
    await screen.findByText("Tokyo Honbu");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link", { name: "Tokyo Honbu" })).toBeNull();
  });

  it("lets a WSKO admin open a root-level branch", async () => {
    roles = ["wsko_admin"];
    renderPage();
    expect((await screen.findByRole("link", { name: "Tokyo Honbu" })).getAttribute("href"))
      .toBe("/admin/branches/b-tokyo/members");
  });

  // The client says "directly under WSKO" with an omitted federation rather
  // than an empty one; the new branch is then opened, to be filled in.
  it("creates a branch directly under WSKO and opens it", async () => {
    roles = ["wsko_admin"];
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Ny klubb" }));
    await user.type(screen.getByLabelText("Klubbens namn"), "Shibuya");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));

    expect(adminCreateBranch).toHaveBeenCalledWith("Shibuya", undefined);
    expect(await screen.findByText("members page")).toBeTruthy();
  });

  it("creates a federation with a normalised country code and opens it", async () => {
    roles = ["wsko_admin"];
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Nytt förbund" }));
    await user.type(screen.getByLabelText("Landskod"), "dk");
    await user.type(screen.getByLabelText("Förbundets namn"), "Dansk Shorinji Kempo Forbund");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));

    expect(adminCreateFederation).toHaveBeenCalledWith("DK", "Dansk Shorinji Kempo Forbund");
    expect(await screen.findByText("federation page")).toBeTruthy();
  });

  // A well-formed-but-unassigned code ("JA", typed for Japan's real code JP)
  // gets its own message rather than the generic 400 one — the server sends a
  // machine-readable reason precisely so the page can say what was wrong.
  it("names the reason when a federation id is not a real country code", async () => {
    roles = ["wsko_admin"];
    adminCreateFederation.mockRejectedValue(new AdminRequestError(400, "invalid_federation_id"));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Nytt förbund" }));
    await user.type(screen.getByLabelText("Landskod"), "JA");
    await user.type(screen.getByLabelText("Förbundets namn"), "Japan");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));

    expect(await screen.findByText("Landskoden måste vara en giltig ISO 3166-1 alpha-2-kod, till exempel SE eller JP.")).toBeTruthy();
  });
});
