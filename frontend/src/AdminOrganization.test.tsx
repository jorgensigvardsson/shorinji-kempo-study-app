import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminOrgTree = vi.fn();
const adminCreateFederation = vi.fn();
const adminRenameFederation = vi.fn();
const adminCreateBranch = vi.fn();
const adminUpdateBranch = vi.fn();
let roles: string[] = [];

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({
    adminOrgTree, adminCreateFederation, adminRenameFederation, adminCreateBranch, adminUpdateBranch,
    getBackendUserInfo: () => ({ roles }),
  }),
}));

import AdminOrganization from "./AdminOrganization";
import { AdminRequestError } from "./sync/backend";

const tree = {
  federations: [
    { id: "SE", name: "Svenska Shorinji Kempoförbundet", branches: [{ id: "b-karlstad", name: "Karlstad" }] },
    { id: "NO", name: "Norges Shorinji Kempo Forbund", branches: [] },
  ],
  wskoBranches: [{ id: "b-tokyo", name: "Tokyo Honbu" }],
};

// The name of a federation also appears in every move-destination list, so a
// card is found by the heading that names it rather than by the text alone.
const cardFor = (heading: string) => {
  const header = screen.getAllByText(heading)
    .map(el => el.closest(".card-header"))
    .find((el): el is Element => el !== null);
  const card = header?.closest(".card");
  if (card === null || card === undefined) throw new Error(`no card headed ${heading}`);
  return within(card as HTMLElement);
};

describe("AdminOrganization", () => {
  beforeEach(() => {
    roles = ["wsko_admin"];
    adminOrgTree.mockReset().mockResolvedValue(tree);
    for (const fn of [adminCreateFederation, adminRenameFederation, adminCreateBranch, adminUpdateBranch]) {
      fn.mockReset().mockResolvedValue(undefined);
    }
  });

  it("shows each federation with its branches", async () => {
    render(<MemoryRouter><AdminOrganization /></MemoryRouter>);
    expect(await screen.findByText("Svenska Shorinji Kempoförbundet")).toBeTruthy();
    expect(cardFor("Svenska Shorinji Kempoförbundet").getByText("Karlstad")).toBeTruthy();
    expect(cardFor("Norges Shorinji Kempo Forbund").getByText("Inga klubbar här.")).toBeTruthy();
  });

  // A branch under no federation belongs to WSKO, which is a place in the
  // organization rather than a missing value — so it gets a heading of its own
  // instead of being mixed in or quietly left out.
  it("gathers root-attached branches under an explicit WSKO heading", async () => {
    render(<MemoryRouter><AdminOrganization /></MemoryRouter>);
    expect(await screen.findByText("Tokyo Honbu")).toBeTruthy();
    expect(cardFor("WSKO").getByText("Tokyo Honbu")).toBeTruthy();
  });

  it("creates a branch inside the federation whose button was pressed", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AdminOrganization /></MemoryRouter>);
    await screen.findByText("Svenska Shorinji Kempoförbundet");

    await user.click(cardFor("Svenska Shorinji Kempoförbundet").getByRole("button", { name: "Ny klubb" }));
    await user.type(screen.getByLabelText("Klubbens namn"), "Arvika");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));

    await waitFor(() => expect(adminCreateBranch).toHaveBeenCalledWith("Arvika", "SE"));
    // And the tree is re-read rather than patched from here.
    expect(adminOrgTree).toHaveBeenCalledTimes(2);
  });

  // Under the WSKO heading there is no federation to name, and the client says so
  // with an omitted id rather than an empty one.
  it("creates a root-attached branch with no federation", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AdminOrganization /></MemoryRouter>);
    await screen.findByText("Tokyo Honbu");

    await user.click(cardFor("WSKO").getByRole("button", { name: "Ny klubb" }));
    await user.type(screen.getByLabelText("Klubbens namn"), "Shibuya");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));

    await waitFor(() => expect(adminCreateBranch).toHaveBeenCalledWith("Shibuya", undefined));
  });

  it("renames a branch", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AdminOrganization /></MemoryRouter>);
    await screen.findByText("Karlstad");

    const se = cardFor("Svenska Shorinji Kempoförbundet");
    await user.click(se.getAllByRole("button", { name: "Byt namn" })[1]); // the branch, not the federation
    const field = screen.getByLabelText("Namn");
    expect((field as HTMLInputElement).value).toBe("Karlstad");
    await user.clear(field);
    await user.type(field, "Karlstads Shorinji Kempo");
    await user.click(screen.getByRole("button", { name: "Spara" }));

    await waitFor(() => expect(adminUpdateBranch).toHaveBeenCalledWith("b-karlstad", { name: "Karlstads Shorinji Kempo" }));
  });

  it("normalises a new federation's country code", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AdminOrganization /></MemoryRouter>);
    await screen.findByText("Tokyo Honbu");

    await user.click(screen.getByRole("button", { name: "Nytt förbund" }));
    await user.type(screen.getByLabelText("Landskod"), "dk");
    await user.type(screen.getByLabelText("Förbundets namn"), "Dansk Shorinji Kempo Forbund");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));

    await waitFor(() => expect(adminCreateFederation).toHaveBeenCalledWith("DK", "Dansk Shorinji Kempo Forbund"));
  });

  // Moving a branch out of a federation and up to WSKO is a real destination, so
  // the empty federation id is sent deliberately rather than omitted.
  it("moves a branch to WSKO once the move is confirmed", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AdminOrganization /></MemoryRouter>);
    await screen.findByText("Karlstad");

    await user.click(cardFor("Svenska Shorinji Kempoförbundet").getByRole("button", { name: "Byt förbund" }));
    await user.selectOptions(screen.getByLabelText("Flytta till"), "");
    await user.click(screen.getByRole("button", { name: "Flytta klubben" }));

    await waitFor(() => expect(adminUpdateBranch).toHaveBeenCalledWith("b-karlstad", { federationId: "" }));
  });

  // The dialog is the whole point of the change: opening it must not move
  // anything, and neither must confirming a destination nobody altered.
  it("moves nothing until a different federation is chosen", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AdminOrganization /></MemoryRouter>);
    await screen.findByText("Karlstad");

    await user.click(cardFor("Svenska Shorinji Kempoförbundet").getByRole("button", { name: "Byt förbund" }));
    expect((screen.getByRole("button", { name: "Flytta klubben" }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(adminUpdateBranch).not.toHaveBeenCalled();
  });

  // What a federation admin is shown, which is not a matter of taste: a move
  // needs authority over both the old federation and the new one, and creating a
  // federation needs authority over WSKO. Neither is theirs, and the server
  // refuses both regardless of what this page draws.
  it("offers a federation admin only what their own federation allows", async () => {
    roles = ["federation_admin:SE"];
    adminOrgTree.mockResolvedValue({ federations: [tree.federations[0]], wskoBranches: [] });
    render(<MemoryRouter><AdminOrganization /></MemoryRouter>);
    await screen.findByText("Karlstad");

    expect(screen.queryByRole("button", { name: "Nytt förbund" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Byt förbund" })).toBeNull();
    expect(screen.queryByText("WSKO")).toBeNull();
    expect(cardFor("Svenska Shorinji Kempoförbundet").getByRole("button", { name: "Ny klubb" })).toBeTruthy();
  });

  // A branch admin may rename their own branch and nothing else — no adding
  // inside the federation that holds it.
  it("lets a branch admin rename their branch but not add siblings", async () => {
    roles = ["branch_admin:b-karlstad"];
    adminOrgTree.mockResolvedValue({
      federations: [{ id: "SE", name: "Svenska Shorinji Kempoförbundet", branches: [{ id: "b-karlstad", name: "Karlstad" }] }],
      wskoBranches: [],
    });
    render(<MemoryRouter><AdminOrganization /></MemoryRouter>);
    await screen.findByText("Karlstad");

    const se = cardFor("Svenska Shorinji Kempoförbundet");
    expect(se.queryByRole("button", { name: "Ny klubb" })).toBeNull();
    expect(se.getAllByRole("button", { name: "Byt namn" })).toHaveLength(1); // the branch alone
  });

  it("says so plainly when the server refuses", async () => {
    const user = userEvent.setup();
    adminCreateFederation.mockRejectedValue(new AdminRequestError(403));
    render(<MemoryRouter><AdminOrganization /></MemoryRouter>);
    await screen.findByText("Tokyo Honbu");

    await user.click(screen.getByRole("button", { name: "Nytt förbund" }));
    await user.type(screen.getByLabelText("Landskod"), "DK");
    await user.type(screen.getByLabelText("Förbundets namn"), "Dansk Shorinji Kempo Forbund");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));

    expect(await screen.findByText("Du har inte behörighet att göra det.")).toBeTruthy();
  });

  it("offers a retry when the tree cannot be fetched", async () => {
    adminOrgTree.mockRejectedValue(new Error("offline"));
    render(<MemoryRouter><AdminOrganization /></MemoryRouter>);

    expect(await screen.findByText("Kunde inte hämta organisationen.")).toBeTruthy();
    adminOrgTree.mockResolvedValue(tree);
    await userEvent.setup().click(screen.getByRole("button", { name: "Försök igen" }));
    expect(await screen.findByText("Karlstad")).toBeTruthy();
  });
});
