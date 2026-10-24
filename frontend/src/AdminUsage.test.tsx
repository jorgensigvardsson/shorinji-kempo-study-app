import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminUsage = vi.fn();
const adminUsageHistory = vi.fn();

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({ adminUsage, adminUsageHistory }),
}));

import AdminUsage from "./AdminUsage";
import { AdminRequestError, type UsageReport } from "./sync/backend";

const report: UsageReport = {
  from: "2026-10-22T00:00:00Z",
  to: "2026-10-23T15:00:00Z",
  bin: "day",
  buckets: [
    { start: "2026-10-22T00:00:00Z", people: 4, byBranch: { karlstad: 3, tokyo: 1 } },
    { start: "2026-10-23T00:00:00Z", people: 2, byBranch: { karlstad: 2 } },
  ],
  people: 5,
  byBranch: { karlstad: 4, tokyo: 1 },
  branches: [
    { id: "karlstad", name: "Karlstad", federationId: "SE", federationName: "Svenska Shorinji Kempoförbundet" },
    { id: "tokyo", name: "Tokyo" },
  ],
};

describe("AdminUsage", () => {
  beforeEach(() => {
    localStorage.clear(); // the live view caches its last answer
    adminUsage.mockReset().mockResolvedValue(report);
  });

  // The figure under a tile's label; the same digits appear on the axis and in
  // the tables too, so a bare text search would find several.
  const tile = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

  it("asks for the last 30 days by day, and leads with the people in them", async () => {
    render(<AdminUsage />);
    await screen.findByRole("img", { name: "Aktiva personer per dag" });
    expect(adminUsage).toHaveBeenCalledWith(30, "day");
    // The window's distinct count, not the sum of its days (which would be 6).
    expect(tile("Aktiva personer")).toBe("5");
    expect(tile("Snitt per dag")).toBe("3");
    expect(tile("Flest på en dag")).toBe("4");
  });

  it("asks again when the period or bucket changes", async () => {
    const user = userEvent.setup();
    render(<AdminUsage />);
    await screen.findByRole("img");

    await user.selectOptions(screen.getByLabelText("Period"), "7");
    await waitFor(() => expect(adminUsage).toHaveBeenLastCalledWith(7, "day"));

    await user.click(screen.getByLabelText("Per vecka"));
    await waitFor(() => expect(adminUsage).toHaveBeenLastCalledWith(7, "week"));
  });

  // Grouping is the page's own work over one report, not another question to the
  // server.
  it("groups by branch and by federation without asking again", async () => {
    const user = userEvent.setup();
    render(<AdminUsage />);
    await screen.findByRole("img");

    await user.selectOptions(screen.getByLabelText("Gruppering"), "branch");
    expect(screen.getByRole("columnheader", { name: "Klubb" })).toBeTruthy();
    expect(screen.getAllByText("Karlstad").length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByLabelText("Gruppering"), "federation");
    expect(screen.getByRole("columnheader", { name: "Förbund" })).toBeTruthy();
    // Organization names are shown as stored, and WSKO is the frontend's label.
    expect(screen.getAllByText("Svenska Shorinji Kempoförbundet").length).toBeGreaterThan(0);
    expect(screen.getAllByText("WSKO").length).toBeGreaterThan(0);

    expect(adminUsage).toHaveBeenCalledTimes(1);
  });

  // A cold auth container takes seconds; the last answer stands in meanwhile.
  it("draws the last answer at once and refreshes it behind a spinner", async () => {
    render(<AdminUsage />);
    await screen.findByRole("img", { name: "Aktiva personer per dag" });
    cleanup();

    let answer: (r: UsageReport) => void = () => {};
    adminUsage.mockReturnValue(new Promise<UsageReport>(resolve => { answer = resolve; }));
    render(<AdminUsage />);

    // Straight from the cache, before the server has said anything.
    expect(screen.getByRole("img", { name: "Aktiva personer per dag" })).toBeTruthy();
    expect(tile("Aktiva personer")).toBe("5");
    expect(screen.getByText("Uppdaterar…")).toBeTruthy();

    answer({ ...report, people: 9 });
    await waitFor(() => expect(tile("Aktiva personer")).toBe("9"));
    expect(screen.queryByText("Uppdaterar…")).toBeNull();
  });

  it("keeps the cached numbers when the refresh fails, and says so", async () => {
    render(<AdminUsage />);
    await screen.findByRole("img", { name: "Aktiva personer per dag" });
    cleanup();

    adminUsage.mockRejectedValue(new AdminRequestError(502));
    render(<AdminUsage />);
    expect(await screen.findByText("Kunde inte uppdatera. Siffrorna är de senast hämtade.")).toBeTruthy();
    expect(tile("Aktiva personer")).toBe("5");
  });

  // Another period's numbers would be wrong numbers, not old ones.
  it("never stands one period's numbers in for another's", async () => {
    const user = userEvent.setup();
    render(<AdminUsage />);
    await screen.findByRole("img", { name: "Aktiva personer per dag" });

    adminUsage.mockReturnValue(new Promise(() => {}));
    await user.selectOptions(screen.getByLabelText("Period"), "7");
    expect(screen.queryByRole("img", { name: "Aktiva personer per dag" })).toBeNull();
  });

  it("switches to the long view and back", async () => {
    adminUsageHistory.mockReset().mockResolvedValue({ items: [], branches: [] });
    localStorage.clear();
    const user = userEvent.setup();
    render(<AdminUsage />);
    await screen.findByRole("img", { name: "Aktiva personer per dag" });

    await user.click(screen.getByLabelText("Över tid"));
    expect(await screen.findByText("Ingen historik ännu. Varje vecka sparas när den är slut.")).toBeTruthy();
    expect(adminUsageHistory).toHaveBeenCalledTimes(1);

    await user.click(screen.getByLabelText("Senaste 30 dagarna"));
    expect(await screen.findByRole("img", { name: "Aktiva personer per dag" })).toBeTruthy();
  });

  it("says when the numbers are invented", async () => {
    adminUsage.mockResolvedValue({ ...report, demo: true });
    render(<AdminUsage />);
    expect(await screen.findByText("Påhittade siffror från utvecklingsmiljön")).toBeTruthy();
  });

  it("tells an unconfigured environment from a failure", async () => {
    adminUsage.mockRejectedValue(new AdminRequestError(503));
    const { unmount } = render(<AdminUsage />);
    expect(await screen.findByText("Användningsstatistiken är inte påslagen i den här miljön.")).toBeTruthy();
    unmount();

    adminUsage.mockRejectedValue(new AdminRequestError(502));
    render(<AdminUsage />);
    expect(await screen.findByText("Kunde inte hämta användningsstatistiken.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Försök igen" })).toBeTruthy();
  });
});
