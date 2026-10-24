import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "./sync/backend";

const adminUsageHistory = vi.fn();
vi.mock("./sync/manager", () => ({ getSyncManager: () => ({ adminUsageHistory }) }));

import {
  cachedLiveUsage, cachedUsageHistory, historyWeeks, lifetimesOf, loadUsageHistory, mergeHistory, rememberLiveUsage, weekStartOf, weeksAsReport,
} from "./usageHistory";

const week = (start: string, people: number, recordedAt: string, extra: Partial<HistoryEntry["week"]> = {}): HistoryEntry => ({
  id: `week:${start.slice(0, 10)}`, type: "week", at: start, recordedAt,
  week: { start, people, byBranch: { karlstad: people }, hours: people * 3, byMode: { standalone: 1 }, byVersion: {}, members: { karlstad: 20 }, ...extra },
});

const event = (id: string, type: HistoryEntry["type"], at: string, recordedAt: string, extra: Partial<HistoryEntry> = {}): HistoryEntry =>
  ({ id, type, at, recordedAt, ...extra });

describe("weekStartOf", () => {
  it("is the Monday at or before, at midnight UTC", () => {
    expect(weekStartOf("2026-10-19T00:00:00Z")).toBe("2026-10-19T00:00:00Z");
    expect(weekStartOf("2026-10-25T23:59:59Z")).toBe("2026-10-19T00:00:00Z");
    expect(weekStartOf("2026-10-26T00:00:00Z")).toBe("2026-10-26T00:00:00Z");
  });
});

describe("historyWeeks", () => {
  it("files events under their week, beside that week's snapshot", () => {
    const rows = historyWeeks([
      week("2026-10-12T00:00:00Z", 5, "r1"),
      event("a", "account_created", "2026-10-14T10:00:00Z", "r2", { branch: "karlstad", via: "admin" }),
      event("b", "account_created", "2026-10-15T10:00:00Z", "r3", { branch: "karlstad", via: "applied" }),
      event("c", "application", "2026-10-13T10:00:00Z", "r4", { outcome: "submitted" }),
      event("d", "application", "2026-10-15T10:00:00Z", "r5", { outcome: "approved" }),
      event("e", "account_deleted", "2026-10-16T10:00:00Z", "r6", { lifetime: "1-6m" }),
      event("f", "transfer", "2026-10-16T11:00:00Z", "r7", { from: "x", to: "y", via: "request" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      start: "2026-10-12T00:00:00Z", created: 2, createdViaAdmin: 1, applications: 1, approved: 1, deleted: 1, moves: 1,
    });
    expect(rows[0].week?.people).toBe(5);
  });

  // A quiet week in the middle must still be a column, not closed up around.
  it("keeps empty weeks between the first and the last", () => {
    const rows = historyWeeks([week("2026-09-28T00:00:00Z", 4, "r1"), week("2026-10-19T00:00:00Z", 6, "r2")]);
    expect(rows.map(r => r.start)).toEqual([
      "2026-09-28T00:00:00Z", "2026-10-05T00:00:00Z", "2026-10-12T00:00:00Z", "2026-10-19T00:00:00Z",
    ]);
    expect(rows[1].week).toBeNull();
  });
});

describe("weeksAsReport", () => {
  it("averages per week, since distinct people cannot be summed across weeks", () => {
    const rows = historyWeeks([week("2026-10-12T00:00:00Z", 4, "r1"), week("2026-10-19T00:00:00Z", 6, "r2")]);
    const report = weeksAsReport(rows, w => ({ total: w.people, byBranch: w.byBranch }), []);
    expect(report.buckets.map(b => b.people)).toEqual([4, 6]);
    expect(report.people).toBe(5);
    expect(report.byBranch.karlstad).toBe(5);
  });
});

describe("lifetimesOf", () => {
  it("counts deletions by how long the account existed", () => {
    const counts = lifetimesOf([
      event("a", "account_deleted", "2026-10-01T00:00:00Z", "r", { lifetime: "<1m" }),
      event("b", "account_deleted", "2026-10-02T00:00:00Z", "r", { lifetime: "<1m" }),
      event("c", "account_deleted", "2026-10-03T00:00:00Z", "r", { lifetime: "2y+" }),
      event("d", "account_created", "2026-10-03T00:00:00Z", "r"),
    ]);
    expect(counts.get("<1m")).toBe(2);
    expect(counts.get("2y+")).toBe(1);
    expect(counts.size).toBe(2);
  });
});

describe("the cache", () => {
  beforeEach(() => {
    localStorage.clear();
    adminUsageHistory.mockReset();
  });

  it("merges by id, so the inclusive cursor's repeat is not counted twice", () => {
    const first = event("a", "account_created", "2026-10-01T00:00:00Z", "2026-10-01T00:00:00.000000Z");
    const merged = mergeHistory([first], [first, event("b", "account_deleted", "2026-10-02T00:00:00Z", "2026-10-02T00:00:00.000000Z")]);
    expect(merged.items.map(e => e.id).sort()).toEqual(["a", "b"]);
    expect(merged.cursor).toBe("2026-10-02T00:00:00.000000Z");
  });

  // The whole point of an append-only history: what was fetched stays true, so
  // the next visit asks only for what is newer.
  it("asks for everything once, then only for what is new", async () => {
    adminUsageHistory.mockResolvedValueOnce({
      items: [week("2026-10-12T00:00:00Z", 4, "2026-10-20T06:00:00.000000Z")], branches: [],
    });
    const first = await loadUsageHistory();
    expect(adminUsageHistory).toHaveBeenLastCalledWith(undefined);
    expect(first.items).toHaveLength(1);

    adminUsageHistory.mockResolvedValueOnce({
      items: [week("2026-10-19T00:00:00Z", 6, "2026-10-27T06:00:00.000000Z")], branches: [{ id: "karlstad", name: "Karlstad" }],
    });
    const second = await loadUsageHistory();
    expect(adminUsageHistory).toHaveBeenLastCalledWith("2026-10-20T06:00:00.000000Z");
    expect(second.items).toHaveLength(2);
    // Names come with each answer and replace whatever was held.
    expect(second.branches).toEqual([{ id: "karlstad", name: "Karlstad" }]);
  });

  it("offers what it holds for drawing before the refresh, names included", async () => {
    expect(cachedUsageHistory()).toBeNull();
    adminUsageHistory.mockResolvedValueOnce({
      items: [week("2026-10-12T00:00:00Z", 4, "2026-10-20T06:00:00.000000Z")], branches: [{ id: "karlstad", name: "Karlstad" }],
    });
    await loadUsageHistory();

    const held = cachedUsageHistory();
    expect(held?.items).toHaveLength(1);
    expect(held?.branches).toEqual([{ id: "karlstad", name: "Karlstad" }]);
  });

  it("keeps the live view's last answer per period and bucket size", () => {
    const report = { from: "a", to: "b", bin: "day" as const, buckets: [], people: 3, byBranch: {}, branches: [] };
    rememberLiveUsage(30, "day", report);
    expect(cachedLiveUsage(30, "day")?.people).toBe(3);
    expect(cachedLiveUsage(7, "day")).toBeNull();
    expect(cachedLiveUsage(30, "week")).toBeNull();
  });

  it("starts over from a cache it cannot read", async () => {
    localStorage.setItem("usage-history-v1", "{not json");
    adminUsageHistory.mockResolvedValueOnce({ items: [], branches: [] });
    await loadUsageHistory();
    expect(adminUsageHistory).toHaveBeenLastCalledWith(undefined);
  });
});
