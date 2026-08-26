import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listBranches = vi.fn();
const myTransfer = vi.fn();
const requestTransfer = vi.fn();
const withdrawTransfer = vi.fn();
let branchId = "b-karlstad";

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({
    listBranches, myTransfer, requestTransfer, withdrawTransfer,
    getBackendUserInfo: () => ({ branchId }),
  }),
}));

import MyBranch from "./MyBranch";
import { AdminRequestError } from "./sync/backend";

const branches = [
  { id: "b-karlstad", name: "Karlstad", federationId: "SE", federationName: "Svenska Shorinji Kempoförbundet" },
  { id: "b-goteborg", name: "Göteborg", federationId: "SE", federationName: "Svenska Shorinji Kempoförbundet" },
  { id: "b-tokyo", name: "Tokyo Honbu" }, // attached to WSKO, not to a federation
];

describe("MyBranch", () => {
  beforeEach(() => {
    branchId = "b-karlstad";
    listBranches.mockReset().mockResolvedValue(branches);
    myTransfer.mockReset().mockResolvedValue(null);
    requestTransfer.mockReset().mockResolvedValue(undefined);
    withdrawTransfer.mockReset().mockResolvedValue(undefined);
  });

  it("says where the member trains", async () => {
    render(<MyBranch />);
    expect(await screen.findByText("Karlstad")).toBeTruthy();
    expect(screen.getByText("Svenska Shorinji Kempoförbundet")).toBeTruthy();
  });

  // There is nothing to decide about staying where you are, so the branch they
  // are already in is not on the list.
  it("offers every branch but their own, grouped by federation", async () => {
    render(<MyBranch />);
    const picker = await screen.findByLabelText("Gren");
    const options = [...(picker as HTMLSelectElement).options].map(o => o.value);
    expect(options).toContain("b-goteborg");
    expect(options).toContain("b-tokyo");
    expect(options).not.toContain("b-karlstad");
    // WSKO is a heading like any federation, and comes last.
    const groups = [...(picker as HTMLSelectElement).querySelectorAll("optgroup")].map(g => g.label);
    expect(groups).toEqual(["Svenska Shorinji Kempoförbundet", "WSKO"]);
  });

  it("asks the branch the member picked", async () => {
    const user = userEvent.setup();
    render(<MyBranch />);
    await screen.findByLabelText("Gren");

    await user.selectOptions(screen.getByLabelText("Gren"), "b-goteborg");
    await user.type(screen.getByLabelText("Meddelande (frivilligt)"), "Jag har flyttat");
    await user.click(screen.getByRole("button", { name: "Skicka ansökan" }));

    await waitFor(() => expect(requestTransfer).toHaveBeenCalledWith("b-goteborg", "Jag har flyttat"));
  });

  it("will not send until a branch is chosen", async () => {
    render(<MyBranch />);
    await screen.findByLabelText("Gren");
    expect((screen.getByRole("button", { name: "Skicka ansökan" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a request that is waiting, and takes it back", async () => {
    myTransfer.mockResolvedValue({
      toBranchId: "b-goteborg", toBranchName: "Göteborg", status: "pending", createdAt: "2026-08-26T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<MyBranch />);

    expect(await screen.findByText("Göteborg")).toBeTruthy();
    // While one is waiting there is nothing to fill in: one at a time.
    expect(screen.queryByLabelText("Gren")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Ta tillbaka ansökan" }));
    await waitFor(() => expect(withdrawTransfer).toHaveBeenCalled());
    expect(await screen.findByLabelText("Gren")).toBeTruthy();
  });

  // Being told no is part of what somebody is entitled to see about themselves,
  // and clearing it is theirs to do.
  it("shows a refusal, and lets the member clear it", async () => {
    myTransfer.mockResolvedValue({
      toBranchId: "b-goteborg", toBranchName: "Göteborg", status: "rejected",
      createdAt: "2026-08-01T00:00:00Z", decidedAt: "2026-08-10T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<MyBranch />);

    expect(await screen.findByText(/godkändes inte/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Rensa" }));
    await waitFor(() => expect(withdrawTransfer).toHaveBeenCalled());
  });

  it("explains a refusal from the server rather than blaming the network", async () => {
    requestTransfer.mockRejectedValue(new AdminRequestError(409));
    const user = userEvent.setup();
    render(<MyBranch />);
    await screen.findByLabelText("Gren");

    await user.selectOptions(screen.getByLabelText("Gren"), "b-goteborg");
    await user.click(screen.getByRole("button", { name: "Skicka ansökan" }));

    expect(await screen.findByText("Du har redan en ansökan som väntar på svar.")).toBeTruthy();
  });

  it("offers a retry when the branches cannot be fetched", async () => {
    listBranches.mockRejectedValue(new Error("offline"));
    render(<MyBranch />);

    expect(await screen.findByText("Kunde inte hämta grenarna.")).toBeTruthy();
    listBranches.mockResolvedValue(branches);
    await userEvent.setup().click(screen.getByRole("button", { name: "Försök igen" }));
    expect(await screen.findByLabelText("Gren")).toBeTruthy();
  });

  // A member admitted before branches existed, or one whose club was removed.
  it("copes with a member who belongs to no branch", async () => {
    branchId = "";
    render(<MyBranch />);
    expect(await screen.findByText("Ingen gren")).toBeTruthy();
    const picker = screen.getByLabelText("Gren") as HTMLSelectElement;
    expect([...picker.options].map(o => o.value)).toContain("b-karlstad");
  });
});
