import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminGetUser = vi.fn();
const adminOrgTree = vi.fn();
const adminSetRoles = vi.fn();
const adminUpdateDisplayName = vi.fn();
const adminLogoutUser = vi.fn();
let callerRoles: string[] = [];
let callerEmail = "boss@example.org";

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({
    adminGetUser, adminOrgTree, adminSetRoles, adminUpdateDisplayName, adminLogoutUser,
    getBackendUserInfo: () => ({ roles: callerRoles, email: callerEmail }),
  }),
}));

import AdminUser from "./AdminUser";
import { AdminRequestError } from "./sync/backend";

const user = {
  id: "u1", email: "ann@example.org", displayName: "Ann Ask", branchId: "b-karlstad",
  linkedIdentities: { email: { sub: "ann@example.org", email: "ann@example.org" } },
  roles: [] as string[], oidc: false, createdAt: "", lastLoginAt: "",
};

const tree = {
  federations: [{ id: "SE", name: "Svenska Shorinji Kempoförbundet", branches: [{ id: "b-karlstad", name: "Karlstad" }] }],
  wskoBranches: [],
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/admin/users/u1"]}>
      <Routes>
        <Route path="/admin/users/:id" element={<AdminUser />} />
      </Routes>
    </MemoryRouter>);

describe("AdminUser", () => {
  beforeEach(() => {
    callerRoles = ["admin"];
    callerEmail = "boss@example.org";
    adminGetUser.mockReset().mockResolvedValue(user);
    adminOrgTree.mockReset().mockResolvedValue(tree);
    for (const fn of [adminSetRoles, adminUpdateDisplayName, adminLogoutUser]) {
      fn.mockReset().mockResolvedValue(undefined);
    }
  });

  // A branch id is not something to show anybody, so the tree is read alongside
  // the user to turn it into the name of a club and the federation above it.
  it("places the member in the organization", async () => {
    renderPage();
    expect(await screen.findByText("Ann Ask")).toBeTruthy();
    const branch = screen.getByRole("link", { name: "Karlstad" });
    expect(branch.getAttribute("href")).toBe("/admin/branches/b-karlstad/members");
    expect(branch.parentElement?.textContent).toContain("Svenska Shorinji Kempoförbundet");
  });

  it("grants a role by sending the whole set, not a flag", async () => {
    adminGetUser.mockResolvedValue({ ...user, roles: ["branch_admin:somewhere-else"] });
    const testUser = userEvent.setup();
    renderPage();
    await screen.findByText("Ann Ask");

    await testUser.click(screen.getByLabelText("Administratör för Karlstad"));

    // The role this page never showed — authority over another branch — survives.
    await waitFor(() => expect(adminSetRoles).toHaveBeenCalledWith(
      "u1", ["branch_admin:somewhere-else", "branch_admin:b-karlstad"]));
  });

  it("revokes by leaving the role out", async () => {
    adminGetUser.mockResolvedValue({ ...user, roles: ["branch_admin:b-karlstad"] });
    const testUser = userEvent.setup();
    renderPage();
    await screen.findByText("Ann Ask");

    await testUser.click(screen.getByLabelText("Administratör för Karlstad"));
    await waitFor(() => expect(adminSetRoles).toHaveBeenCalledWith("u1", []));
  });

  // The technical superuser is handed out by admins alone. A WSKO admin covers
  // the same scope, so nothing but this rule stops them granting themselves the
  // one power their own role withholds — and the server enforces it too.
  it("offers the technical role to an admin", async () => {
    renderPage();
    await screen.findByText("Ann Ask");
    expect(screen.getByLabelText("Teknisk administratör")).toBeTruthy();
  });

  it("withholds the technical role from a WSKO admin", async () => {
    callerRoles = ["wsko_admin"];
    renderPage();
    await screen.findByText("Ann Ask");
    expect(screen.getByLabelText("Administratör för hela organisationen")).toBeTruthy();
    expect(screen.queryByLabelText("Teknisk administratör")).toBeNull();
  });

  // Somebody appointed from further up keeps their standing on the page: a
  // branch admin should see that this member answers to the federation, without
  // being offered a switch that would only be refused.
  it("shows a role it cannot grant, but does not offer to change it", async () => {
    callerRoles = ["branch_admin:b-karlstad"];
    adminGetUser.mockResolvedValue({ ...user, roles: ["federation_admin:SE"] });
    renderPage();
    await screen.findByText("Ann Ask");

    const federation = screen.getByLabelText("Administratör för Svenska Shorinji Kempoförbundet") as HTMLInputElement;
    expect(federation.checked).toBe(true);
    expect(federation.disabled).toBe(true);
    // Their own branch is theirs to grant.
    expect((screen.getByLabelText("Administratör för Karlstad") as HTMLInputElement).disabled).toBe(false);
  });

  it("will not let an admin switch off their own authority", async () => {
    callerEmail = "ann@example.org";
    adminGetUser.mockResolvedValue({ ...user, roles: ["admin"] });
    renderPage();
    await screen.findByText("Ann Ask");

    expect((screen.getByLabelText("Teknisk administratör") as HTMLInputElement).disabled).toBe(true);
  });

  it("says what the server said when a change is refused", async () => {
    adminSetRoles.mockRejectedValue(new AdminRequestError(403));
    const testUser = userEvent.setup();
    renderPage();
    await screen.findByText("Ann Ask");

    await testUser.click(screen.getByLabelText("Administratör för Karlstad"));
    expect(await screen.findByText("Du har inte behörighet att göra det.")).toBeTruthy();
  });

  it("renames a member whose name is not owned by a provider", async () => {
    const testUser = userEvent.setup();
    renderPage();
    await screen.findByText("Ann Ask");

    const field = screen.getByLabelText("Namn");
    await testUser.clear(field);
    await testUser.type(field, "Ann Ask-Berg");
    await testUser.click(screen.getByRole("button", { name: "Spara" }));

    await waitFor(() => expect(adminUpdateDisplayName).toHaveBeenCalledWith("u1", "Ann Ask-Berg"));
  });

  it("leaves an OIDC name alone", async () => {
    adminGetUser.mockResolvedValue({ ...user, oidc: true });
    renderPage();
    await screen.findByRole("heading", { name: "Ann Ask" });
    expect(screen.queryByRole("button", { name: "Spara" })).toBeNull();
  });

  // Ending somebody's sessions everywhere is not a thing to do on one click.
  it("asks before ending every session", async () => {
    const testUser = userEvent.setup();
    renderPage();
    await screen.findByText("Ann Ask");

    await testUser.click(screen.getByRole("button", { name: "Logga ut" }));
    expect(adminLogoutUser).not.toHaveBeenCalled();

    await testUser.click(screen.getByRole("button", { name: "Ja, logga ut" }));
    await waitFor(() => expect(adminLogoutUser).toHaveBeenCalledWith("u1"));
    expect(await screen.findByText("Utloggad")).toBeTruthy();
  });

  it("treats a user it may not see as one that is not there", async () => {
    adminGetUser.mockRejectedValue(new AdminRequestError(404));
    renderPage();
    expect(await screen.findByText("Den här användaren finns inte, eller så har du inte behörighet till den.")).toBeTruthy();
  });
});
