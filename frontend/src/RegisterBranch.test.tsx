import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getJoinContext = vi.fn();
const listBranches = vi.fn();
const submitJoinRequest = vi.fn();
const withdrawJoinRequest = vi.fn();

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({ getJoinContext, listBranches, submitJoinRequest, withdrawJoinRequest }),
}));

import { TranslatorImplementation } from "./i18n";
import RegisterBranch from "./RegisterBranch";

// The assertions read the Swedish source text, which is what an empty
// translation table falls back to.
const translator = new TranslatorImplementation({}, "sv");

const show = () => render(
  <RegisterBranch translator={translator} language="sv" onBack={() => {}} />
);

const branches = [
  { id: "goteborg", name: "Göteborg", federationId: "SE", federationName: "Svenska Shorinji Kempoförbundet" },
  { id: "karlstad", name: "Karlstad", federationId: "SE", federationName: "Svenska Shorinji Kempoförbundet" },
  { id: "oslo", name: "Oslo", federationId: "NO", federationName: "Norges Shorinji Kempo Forbund" },
  { id: "tokyo", name: "Tokyo" }, // attached straight to WSKO
];

describe("RegisterBranch", () => {
  beforeEach(() => {
    getJoinContext.mockReset().mockResolvedValue({ email: "hopeful@example.org", name: "Hopeful", provider: "email" });
    listBranches.mockReset().mockResolvedValue(branches);
    submitJoinRequest.mockReset().mockResolvedValue({ ok: true });
    withdrawJoinRequest.mockReset().mockResolvedValue(undefined);
  });

  // WSKO is the root rather than a federation with a name of its own, so
  // branches attached to it need a heading supplied here — without one they
  // would read as though they had been left out of the list.
  it("groups branches by federation, with WSKO last", async () => {
    show();
    const select = await screen.findByLabelText("Klubb");

    const groups = within(select).getAllByRole("group");
    expect(groups.map(g => g.getAttribute("label"))).toEqual([
      "Norges Shorinji Kempo Forbund",
      "Svenska Shorinji Kempoförbundet",
      "WSKO",
    ]);
    expect(within(groups[2]).getByRole("option", { name: "Tokyo" })).toBeTruthy();
    // Branches within a federation are in name order.
    expect(within(groups[1]).getAllByRole("option").map(o => o.textContent))
      .toEqual(["Göteborg", "Karlstad"]);
  });

  it("prefills the name the address was verified under", async () => {
    show();
    expect((await screen.findByLabelText("Ditt namn") as HTMLInputElement).value).toBe("Hopeful");
  });

  it("sends the branch, name and note, then shows the request as pending", async () => {
    const user = userEvent.setup();
    show();

    await user.selectOptions(await screen.findByLabelText("Klubb"), "karlstad");
    await user.type(screen.getByLabelText(/Meddelande till klubben/), "Tränar på tisdagar");
    await user.click(screen.getByRole("button", { name: "Skicka ansökan" }));

    await waitFor(() => expect(submitJoinRequest).toHaveBeenCalledWith(
      "karlstad", "Hopeful", "Tränar på tisdagar", "sv"));
    expect(await screen.findByText("Din ansökan är inskickad")).toBeTruthy();
  });

  it("cannot be submitted without a branch", async () => {
    show();
    await screen.findByLabelText("Klubb");
    expect((screen.getByRole("button", { name: "Skicka ansökan" }) as HTMLButtonElement).disabled).toBe(true);
  });

  // A returning applicant lands on their request rather than on an empty form
  // that would only tell them they already have one.
  it("opens on the pending request when there already is one", async () => {
    getJoinContext.mockResolvedValue({
      email: "hopeful@example.org", name: "Hopeful", provider: "email",
      pending: { branchId: "karlstad", branchName: "Karlstad", createdAt: "2026-08-26T00:00:00Z" },
    });
    show();

    expect(await screen.findByText("Din ansökan är inskickad")).toBeTruthy();
    expect(screen.queryByLabelText("Klubb")).toBeNull();
  });

  it("withdraws a pending request and returns to the form", async () => {
    const user = userEvent.setup();
    getJoinContext.mockResolvedValue({
      email: "hopeful@example.org", name: "Hopeful", provider: "email",
      pending: { branchId: "karlstad", branchName: "Karlstad", createdAt: "2026-08-26T00:00:00Z" },
    });
    show();

    await user.click(await screen.findByRole("button", { name: "Återkalla ansökan" }));
    await waitFor(() => expect(withdrawJoinRequest).toHaveBeenCalled());
    expect(await screen.findByLabelText("Klubb")).toBeTruthy();
  });

  // An expired ticket is not an error the visitor can fix on this screen: the
  // remedy is to verify the address again.
  it("sends the visitor back when there is no ticket", async () => {
    getJoinContext.mockResolvedValue(null);
    show();

    expect(await screen.findByText(/Verifiera din e-postadress igen/)).toBeTruthy();
    expect(screen.queryByLabelText("Klubb")).toBeNull();
  });

  it("says so when the address already has an account", async () => {
    const user = userEvent.setup();
    submitJoinRequest.mockResolvedValue({ ok: false, reason: "account_exists" });
    show();

    await user.selectOptions(await screen.findByLabelText("Klubb"), "karlstad");
    await user.click(screen.getByRole("button", { name: "Skicka ansökan" }));

    expect(await screen.findByText(/Logga in i stället/)).toBeTruthy();
  });
});
