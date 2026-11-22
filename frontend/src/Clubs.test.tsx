import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listBranches = vi.fn();
const adminOrgTree = vi.fn();
const myTransfer = vi.fn();
let branchId = "";
let roles: string[] | null = null; // null: nobody signed in

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({
    listBranches, adminOrgTree, myTransfer,
    getState: () => ({ status: "idle" }),
    subscribe: () => () => {},
    getBackendUserInfo: () => (roles === null ? null : { id: "member", roles, branchId }),
  }),
}));

import Clubs from "./Clubs";

const openDirectory = async () => {
  const user = userEvent.setup();
  for (const header of document.querySelectorAll<HTMLElement>(".clubs-directory .card-header[aria-expanded='false']")) {
    await user.click(header);
  }
};

// The public list, as GET /auth/org/branches serves it to anybody.
const publicBranches = [
  { id: "b-karlstad", name: "Karlstad", federationId: "SE", federationName: "Svenska Shorinji Kempoförbundet" },
  { id: "b-goteborg", name: "Göteborg", federationId: "SE", federationName: "Svenska Shorinji Kempoförbundet" },
  { id: "b-tokyo", name: "Tokyo Honbu" },
];

const cardFor = (heading: string) => {
  const header = screen.getAllByText(heading)
    .map(el => el.closest(".card-header"))
    .find((el): el is Element => el !== null);
  const card = header?.closest(".card");
  if (card === null || card === undefined) throw new Error(`no card headed ${heading}`);
  return within(card as HTMLElement);
};

describe("Clubs", () => {
  beforeEach(() => {
    // The list/tree choice persists to localStorage (see Clubs.tsx)
    // so it survives navigating away from the page and back — which means it
    // survives just as readily from one test to the next unless cleared.
    localStorage.clear();
    roles = null;
    branchId = "";
    myTransfer.mockReset().mockResolvedValue(null);
    listBranches.mockReset().mockResolvedValue(publicBranches);
    adminOrgTree.mockReset().mockResolvedValue({ federations: [], wskoBranches: [] });
  });

  // Anybody may look: the shape of the organization is as public as the club
  // picker at registration, which reads the same list.
  it("shows the whole organization to somebody who is not signed in", async () => {
    render(<MemoryRouter><Clubs /></MemoryRouter>);
    expect(await screen.findByText("Svenska Shorinji Kempoförbundet")).toBeTruthy();
    expect(cardFor("Svenska Shorinji Kempoförbundet").getByText("Karlstad")).toBeTruthy();
    expect(cardFor("WSKO").getByText("Tokyo Honbu")).toBeTruthy();
    // Nobody to ask the admin endpoint on behalf of.
    expect(adminOrgTree).not.toHaveBeenCalled();
  });

  it("lists branches by name within their federation", async () => {
    render(<MemoryRouter><Clubs /></MemoryRouter>);
    await screen.findByText("Karlstad");
    const names = cardFor("Svenska Shorinji Kempoförbundet").getAllByText(/Göteborg|Karlstad/).map(el => el.textContent);
    expect(names).toEqual(["Göteborg", "Karlstad"]);
  });

  // Every federation, and WSKO, has a page of its own, and the heading is the
  // way there — for everybody, since those pages are as public as this one.
  it("links each federation and WSKO to its own page", async () => {
    render(<MemoryRouter><Clubs /></MemoryRouter>);
    await screen.findByText("Karlstad");
    await openDirectory();
    expect(screen.getByRole("link", { name: "Visa förbundet" }).getAttribute("href"))
      .toBe("/admin/federations/SE");
    expect(screen.getByRole("link", { name: "Visa WSKO" }).getAttribute("href")).toBe("/admin/wsko");
  });

  // The flag says which country; the code is the system's key.
  it("does not print a federation's country code", async () => {
    render(<MemoryRouter><Clubs /></MemoryRouter>);
    await screen.findByText("Karlstad");
    expect(screen.queryByText("SE")).toBeNull();
  });

  // Who is in a branch is for those who administer it.
  it("does not link branches to their members for somebody who covers none of them", async () => {
    roles = [];
    render(<MemoryRouter><Clubs /></MemoryRouter>);
    await screen.findByText("Karlstad");
    await openDirectory();
    expect(screen.queryByRole("link", { name: "Karlstad" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Tokyo Honbu" })).toBeNull();
  });

  it("links a branch to its members for its own admin, and only that branch", async () => {
    roles = ["branch_admin:b-karlstad"];
    render(<MemoryRouter><Clubs /></MemoryRouter>);
    await screen.findByText("Karlstad");
    await openDirectory();
    expect(screen.getByRole("link", { name: "Karlstad" }).getAttribute("href")).toBe("/admin/branches/b-karlstad/members");
    expect(screen.queryByRole("link", { name: "Göteborg" })).toBeNull();
  });

  it("links every branch in a federation for that federation's admin", async () => {
    roles = ["federation_admin:SE"];
    render(<MemoryRouter><Clubs /></MemoryRouter>);
    await screen.findByText("Karlstad");
    await openDirectory();
    expect(screen.getByRole("link", { name: "Karlstad" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Göteborg" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Tokyo Honbu" })).toBeNull();
  });

  // What only an admin may know is laid over the public picture: member counts
  // for the branches they cover, and a federation of theirs with no branch yet,
  // which a list of branches cannot show.
  it("adds an admin's member counts and empty federations to the public picture", async () => {
    roles = ["federation_admin:SE", "federation_admin:NO"];
    adminOrgTree.mockResolvedValue({
      federations: [
        { id: "SE", name: "Svenska Shorinji Kempoförbundet", branches: [{ id: "b-karlstad", name: "Karlstad", memberCount: 12 }] },
        { id: "NO", name: "Norges Shorinji Kempo Forbund", branches: [] },
      ],
      wskoBranches: [],
    });
    render(<MemoryRouter><Clubs /></MemoryRouter>);
    await screen.findByText("Karlstad");

    expect(cardFor("Svenska Shorinji Kempoförbundet").getByTestId("member-count").textContent).toBe("12");
    expect(cardFor("Norges Shorinji Kempo Forbund").getByText("Inga klubbar här.")).toBeTruthy();
    // Göteborg is still there, from the public list, with no count to show.
    expect(cardFor("Svenska Shorinji Kempoförbundet").getByText("Göteborg")).toBeTruthy();
    expect(screen.getAllByTestId("member-count")).toHaveLength(1);
  });

  it("still shows the public organization when an admin's own part cannot be fetched", async () => {
    roles = ["wsko_admin"];
    adminOrgTree.mockRejectedValue(new Error("offline"));
    render(<MemoryRouter><Clubs /></MemoryRouter>);
    expect(await screen.findByText("Karlstad")).toBeTruthy();
  });

  // Changing things happens on the federation's, WSKO's or branch's own page.
  it("keeps organization editing on the existing detail pages", async () => {
    roles = ["wsko_admin"];
    render(<MemoryRouter><Clubs /></MemoryRouter>);
    await screen.findByText("Karlstad");
    expect(screen.queryByRole("button", { name: "Ny klubb" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nytt förbund" })).toBeNull();
  });

  it("defaults to the list view", async () => {
    render(<MemoryRouter><Clubs /></MemoryRouter>);
    await screen.findByText("Karlstad");
    expect(screen.getByRole("button", { name: /Lista/ }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-testid^="rf__node-"]')).toBeNull();
    for (const header of document.querySelectorAll(".clubs-directory .card-header")) {
      expect(header.getAttribute("aria-expanded")).toBe("false");
    }
  });

  // The tree view is its own lazily-loaded chunk (see Clubs.tsx),
  // so switching to it is also the one place that exercises the Suspense
  // boundary — findByText has to wait out both the import and the render.
  it("switches to the tree view and shows the same organization there", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Clubs /></MemoryRouter>);
    await screen.findByText("Karlstad");

    await user.click(screen.getByRole("button", { name: /Träd/ }));

    expect(await screen.findByText("Tokyo Honbu")).toBeTruthy();
    expect(document.querySelector('[data-testid="rf__node-b-karlstad"]')).toBeTruthy();
    // The list view's cards are gone rather than merely hidden underneath.
    expect(document.querySelector(".card-header")).toBeNull();
  });

  // Opening a federation's page and coming back unmounts and remounts this
  // component — that is what a route change does — so the chosen view has to
  // survive in something other than this component's own state.
  it("keeps the tree view chosen after the page remounts", async () => {
    const user = userEvent.setup();
    const first = render(<MemoryRouter><Clubs /></MemoryRouter>);
    await screen.findByText("Karlstad");
    await user.click(screen.getByRole("button", { name: /Träd/ }));
    await screen.findByText("Tokyo Honbu");
    first.unmount();

    render(<MemoryRouter><Clubs /></MemoryRouter>);
    await screen.findByText("Karlstad");
    expect(screen.getByRole("button", { name: /Träd/ }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".card-header")).toBeNull();
  });

  it("offers a retry when the organization cannot be fetched", async () => {
    listBranches.mockRejectedValue(new Error("offline"));
    render(<MemoryRouter><Clubs /></MemoryRouter>);

    expect(await screen.findByText("Kunde inte hämta organisationen.")).toBeTruthy();
    listBranches.mockResolvedValue(publicBranches);
    await userEvent.setup().click(screen.getByRole("button", { name: "Försök igen" }));
    expect(await screen.findByText("Karlstad")).toBeTruthy();
  });

  it("puts the member's branch first and reuses the directory data", async () => {
    roles = [];
    branchId = "b-karlstad";
    render(<MemoryRouter><Clubs /></MemoryRouter>);
    const own = await screen.findByRole("region", { name: "Min klubb" });
    const directory = screen.getByRole("region", { name: "Alla klubbar och förbund" });
    expect(within(own).getByText("Karlstad")).toBeTruthy();
    expect(own.compareDocumentPosition(directory) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(listBranches).toHaveBeenCalledTimes(1);
    await openDirectory();
    expect(within(directory).getByText("Din klubb")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Administrera klubben" })).toBeNull();
  });

  it("offers management of the member's own branch only with covering authority", async () => {
    roles = ["federation_admin:SE"];
    branchId = "b-karlstad";
    render(<MemoryRouter><Clubs /></MemoryRouter>);
    const own = await screen.findByRole("region", { name: "Min klubb" });
    expect(within(own).getByRole("link", { name: "Administrera klubben" }).getAttribute("href"))
      .toBe("/admin/branches/b-karlstad/members");
  });

  it("does not offer own-branch management to an admin of a different branch", async () => {
    roles = ["branch_admin:b-goteborg"];
    branchId = "b-karlstad";
    render(<MemoryRouter><Clubs /></MemoryRouter>);
    await screen.findByRole("region", { name: "Min klubb" });
    expect(screen.queryByRole("link", { name: "Administrera klubben" })).toBeNull();
  });
});
