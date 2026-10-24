import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminUsageHistory = vi.fn();
vi.mock("./sync/manager", () => ({ getSyncManager: () => ({ adminUsageHistory }) }));

import AdminUsageHistory from "./AdminUsageHistory";
import { AdminRequestError, type HistoryEntry } from "./sync/backend";

const items: HistoryEntry[] = [
  {
    id: "week:2026-10-12", type: "week", at: "2026-10-19T00:00:00Z", recordedAt: "2026-10-19T06:00:00.000000Z",
    week: { start: "2026-10-12T00:00:00Z", people: 7, byBranch: { karlstad: 5, tokyo: 2 }, hours: 30,
      byMode: { standalone: 4, browser: 3 }, byVersion: { abc: 7 }, members: { karlstad: 12, tokyo: 8 } },
  },
  {
    id: "week:2026-10-19", type: "week", at: "2026-10-26T00:00:00Z", recordedAt: "2026-10-26T06:00:00.000000Z",
    week: { start: "2026-10-19T00:00:00Z", people: 8, byBranch: { karlstad: 6, tokyo: 2 }, hours: 33,
      byMode: { standalone: 6, browser: 2 }, byVersion: { abc: 8 }, members: { karlstad: 13, tokyo: 8 } },
  },
  { id: "c1", type: "account_created", at: "2026-10-20T10:00:00Z", recordedAt: "2026-10-20T10:00:00.000000Z", branch: "karlstad", via: "admin" },
  { id: "d1", type: "account_deleted", at: "2026-10-21T10:00:00Z", recordedAt: "2026-10-21T10:00:00.000000Z", branch: "tokyo", lifetime: "<1m" },
  { id: "a1", type: "application", at: "2026-10-13T10:00:00Z", recordedAt: "2026-10-13T10:00:00.000000Z", branch: "karlstad", outcome: "submitted" },
];

const branches = [
  { id: "karlstad", name: "Karlstad", federationId: "SE", federationName: "Svenska Shorinji Kempoförbundet" },
  { id: "tokyo", name: "Tokyo" },
];

// The figure under a tile's label; the same digits appear in tables and on axes.
const tile = (label: string) => screen.getAllByText(label)[0].nextElementSibling?.textContent;

describe("AdminUsageHistory", () => {
  beforeEach(() => {
    localStorage.clear();
    adminUsageHistory.mockReset().mockResolvedValue({ items, branches });
  });

  it("leads with the membership and the latest week", async () => {
    render(<AdminUsageHistory />);
    await screen.findByRole("img", { name: "Aktiva personer per vecka" });

    expect(tile("Medlemmar")).toBe("21");
    expect(tile("Aktiva senaste veckan")).toBe("8");
    expect(tile("Nya konton")).toBe("1");
    expect(tile("Avslutade konton")).toBe("1");
    // Six of the eight active people last week run it installed.
    expect(tile("Installerad på hemskärmen")).toMatch(/75/);
    expect(screen.getByRole("img", { name: "Medlemmar per vecka" })).toBeTruthy();
  });

  it("groups both charts by federation, with organization names as stored", async () => {
    const user = userEvent.setup();
    render(<AdminUsageHistory />);
    await screen.findByRole("img", { name: "Aktiva personer per vecka" });

    await user.selectOptions(screen.getByLabelText("Gruppering"), "federation");
    // One legend per chart.
    expect(screen.getAllByText("Svenska Shorinji Kempoförbundet")).toHaveLength(2);
    expect(screen.getAllByText("WSKO")).toHaveLength(2);
  });

  it("draws what it holds at once and tops it up behind a spinner", async () => {
    const { unmount } = render(<AdminUsageHistory />);
    await screen.findByRole("img", { name: "Aktiva personer per vecka" });
    unmount();

    adminUsageHistory.mockReturnValue(new Promise(() => {})); // a refresh that never lands
    render(<AdminUsageHistory />);
    expect(screen.getByRole("img", { name: "Aktiva personer per vecka" })).toBeTruthy();
    expect(tile("Aktiva senaste veckan")).toBe("8");
    expect(screen.getByText("Uppdaterar…")).toBeTruthy();
  });

  it("says plainly when there is nothing yet", async () => {
    adminUsageHistory.mockResolvedValue({ items: [], branches });
    render(<AdminUsageHistory />);
    expect(await screen.findByText("Ingen historik ännu. Varje vecka sparas när den är slut.")).toBeTruthy();
  });

  it("tells an unconfigured environment from a failure", async () => {
    adminUsageHistory.mockRejectedValue(new AdminRequestError(503));
    const { unmount } = render(<AdminUsageHistory />);
    expect(await screen.findByText("Användningsstatistiken är inte påslagen i den här miljön.")).toBeTruthy();
    unmount();

    adminUsageHistory.mockRejectedValue(new AdminRequestError(500));
    render(<AdminUsageHistory />);
    expect(await screen.findByText("Kunde inte hämta historiken.")).toBeTruthy();
  });
});
