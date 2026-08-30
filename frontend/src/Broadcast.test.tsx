import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminOrgTree = vi.fn();
const broadcastPush = vi.hoisted(() => vi.fn());
let roles: string[] = [];
let branchId = "";

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({
    adminOrgTree,
    getBackendUserInfo: () => ({ roles, branchId }),
  }),
}));

vi.mock("./push", () => ({ broadcastPush }));

import Broadcast from "./Broadcast";

// One federation with two branches, one branch attached straight to WSKO —
// enough shape to exercise every candidate kind the picker can offer.
const tree = {
  federations: [
    {
      id: "SE", name: "Svenska Shorinji Kempoförbundet",
      branches: [{ id: "karlstad", name: "Karlstad" }, { id: "goteborg", name: "Göteborg" }],
    },
    { id: "NO", name: "Norges Shorinji Kempo Forbund", branches: [{ id: "oslo", name: "Oslo" }] },
  ],
  wskoBranches: [{ id: "tokyo", name: "Tokyo Honbu" }],
};

const fillAndSubmit = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText("Rubrik"), "Träningen är inställd");
  await user.click(screen.getByRole("button", { name: /Skicka notis/ }));
};

describe("Broadcast", () => {
  beforeEach(() => {
    adminOrgTree.mockReset().mockResolvedValue(tree);
    broadcastPush.mockReset().mockResolvedValue({ sent: 3, pruned: 0, failed: 0 });
  });

  it("shows no picker for an admin of exactly one branch, and sends without confirming to their own club", async () => {
    roles = ["branch_admin:karlstad"];
    branchId = "karlstad";
    const user = userEvent.setup();
    render(<Broadcast />);

    expect(await screen.findByText(/Karlstad/)).toBeTruthy();
    expect(screen.queryByText("Mottagare")).toBeNull();

    await fillAndSubmit(user);

    await waitFor(() => expect(broadcastPush).toHaveBeenCalledTimes(1));
    expect(broadcastPush).toHaveBeenCalledWith(expect.objectContaining({
      audience: [{ kind: "branch", id: "karlstad" }],
    }));
    expect(screen.queryByText("Bekräfta sändning")).toBeNull();
  });

  it("confirms before sending to a single branch that is not the sender's own", async () => {
    roles = ["branch_admin:karlstad"];
    branchId = "goteborg"; // administers karlstad, but trains at göteborg
    const user = userEvent.setup();
    render(<Broadcast />);
    await screen.findByText(/Karlstad/);

    await fillAndSubmit(user);
    expect(await screen.findByText("Bekräfta sändning")).toBeTruthy();
    expect(broadcastPush).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: /Skicka notis/ })[1]);
    await waitFor(() => expect(broadcastPush).toHaveBeenCalledTimes(1));
  });

  it("preselects the one federation an admin of exactly one administers, and lets them narrow to a branch", async () => {
    roles = ["federation_admin:SE"];
    branchId = "";
    const user = userEvent.setup();
    render(<Broadcast />);

    await screen.findByText("Mottagare");
    const wholeFederation = screen.getByRole("checkbox", { name: "Svenska Shorinji Kempoförbundet" });
    expect((wholeFederation as HTMLInputElement).checked).toBe(true);

    await fillAndSubmit(user);
    await screen.findByText("Bekräfta sändning");
    expect(screen.getByText(/alla klubbar i Svenska Shorinji Kempoförbundet/)).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: /Skicka notis/ })[1]);
    await waitFor(() => expect(broadcastPush).toHaveBeenCalledWith(expect.objectContaining({
      audience: [{ kind: "federation", id: "SE" }],
    })));

    // Narrowing: checking one branch replaces the federation-scope entry.
    broadcastPush.mockClear();
    await user.click(screen.getByRole("checkbox", { name: "Karlstad" }));
    expect((screen.getByRole("checkbox", { name: "Svenska Shorinji Kempoförbundet" }) as HTMLInputElement).checked).toBe(false);

    await fillAndSubmit(user);
    await screen.findByText("Bekräfta sändning");
    await user.click(screen.getAllByRole("button", { name: /Skicka notis/ })[1]);
    await waitFor(() => expect(broadcastPush).toHaveBeenCalledWith(expect.objectContaining({
      audience: [{ kind: "branch", id: "karlstad" }],
    })));
  });

  it("offers 'everyone in WSKO' to an admin who covers the root, and confirms it", async () => {
    roles = ["wsko_admin"];
    branchId = "";
    const user = userEvent.setup();
    render(<Broadcast />);

    await screen.findByText("Alla i WSKO");
    await user.click(screen.getByRole("checkbox", { name: "Alla i WSKO" }));

    await fillAndSubmit(user);
    expect(await screen.findByText("Bekräfta sändning")).toBeTruthy();
    expect(screen.getByText(/hela organisationen \(WSKO\)/)).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: /Skicka notis/ })[1]);
    await waitFor(() => expect(broadcastPush).toHaveBeenCalledWith(expect.objectContaining({
      audience: [{ kind: "wsko" }],
    })));
  });

  // wsko_admin and admin hold no explicit federation_admin:/branch_admin:
  // roles of their own, so the picker must not read its candidates off those
  // — every federation and WSKO-attached branch in the tree has to be
  // individually offered too, "all" being a shortcut rather than the only option.
  it("also offers every federation and WSKO-attached branch individually to a WSKO/technical admin", async () => {
    for (const wideRoles of [["wsko_admin"], ["admin"]]) {
      roles = wideRoles;
      branchId = "";
      const user = userEvent.setup();
      const { unmount } = render(<Broadcast />);

      await screen.findByText("Alla i WSKO");
      expect(screen.getByRole("checkbox", { name: "Svenska Shorinji Kempoförbundet" })).toBeTruthy();
      expect(screen.getByRole("checkbox", { name: "Norges Shorinji Kempo Forbund" })).toBeTruthy();
      expect(screen.getByRole("checkbox", { name: "Tokyo Honbu" })).toBeTruthy();

      // Picking one federation and the standalone branch, without touching "all".
      await user.click(screen.getByRole("checkbox", { name: "Norges Shorinji Kempo Forbund" }));
      await user.click(screen.getByRole("checkbox", { name: "Tokyo Honbu" }));
      await fillAndSubmit(user);
      await screen.findByText("Bekräfta sändning");
      await user.click(screen.getAllByRole("button", { name: /Skicka notis/ })[1]);
      await waitFor(() => expect(broadcastPush).toHaveBeenCalledWith(expect.objectContaining({
        audience: [{ kind: "federation", id: "NO" }, { kind: "branch", id: "tokyo" }],
      })));

      broadcastPush.mockClear();
      unmount();
    }
  });

  it("disables sending until something is picked, for an admin of several things", async () => {
    roles = ["federation_admin:SE", "branch_admin:oslo"];
    branchId = "";
    const user = userEvent.setup();
    render(<Broadcast />);

    await screen.findByText("Mottagare");
    await user.type(screen.getByLabelText("Rubrik"), "Hej");
    expect((screen.getByRole("button", { name: "Skicka notis" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Välj minst en mottagare.")).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "Oslo" }));
    expect((screen.getByRole("button", { name: "Skicka notis" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
