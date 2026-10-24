import { describe, expect, it } from "vitest";
import { assignColorSlots, buildUsageSeries, MaxEntitySeries, type UsageGroup } from "./usageSeries";
import type { UsageReport } from "./sync/backend";

const labels = { all: "Aktiva personer", noBranch: "Ingen klubb", deleted: "Borttagen klubb", other: "Övriga", wsko: "WSKO" };

const branches = [
  { id: "karlstad", name: "Karlstad", federationId: "SE", federationName: "Svenska Shorinji Kempoförbundet" },
  { id: "goteborg", name: "Göteborg", federationId: "SE", federationName: "Svenska Shorinji Kempoförbundet" },
  { id: "oslo", name: "Oslo", federationId: "NO", federationName: "Norges Shorinji Kempo Forbund" },
  { id: "tokyo", name: "Tokyo" }, // attached to WSKO
];

const report = (overrides: Partial<UsageReport> = {}): UsageReport => ({
  from: "2026-10-22T00:00:00Z",
  to: "2026-10-23T15:00:00Z",
  bin: "day",
  buckets: [
    { start: "2026-10-22T00:00:00Z", people: 6, byBranch: { karlstad: 3, goteborg: 1, oslo: 1, "": 1 } },
    { start: "2026-10-23T00:00:00Z", people: 5, byBranch: { karlstad: 2, tokyo: 2, gone: 1 } },
  ],
  people: 9,
  byBranch: { karlstad: 4, goteborg: 1, oslo: 1, tokyo: 2, gone: 1, "": 1 },
  branches,
  ...overrides,
});

describe("buildUsageSeries", () => {
  it("is one series of the server's own counts when nothing is grouped", () => {
    const series = buildUsageSeries(report(), "none", labels);
    expect(series.groups).toEqual([{ key: "all", label: "Aktiva personer", kind: "entity" }]);
    expect(series.columns.map(c => c.values)).toEqual([[6], [5]]);
    // The window total is the server's distinct count, not the sum of the days.
    expect(series.totals).toEqual([9]);
  });

  it("stacks branches largest first, naming the branchless and the deleted", () => {
    const series = buildUsageSeries(report(), "branch", labels);
    expect(series.groups.map(g => g.label)).toEqual(
      ["Karlstad", "Tokyo", "Borttagen klubb", "Göteborg", "Ingen klubb", "Oslo"]);
    expect(series.totals).toEqual([4, 2, 1, 1, 1, 1]);
    const first = series.columns[0];
    expect(first.values[series.groups.findIndex(g => g.label === "Karlstad")]).toBe(3);
    expect(first.values[series.groups.findIndex(g => g.label === "Ingen klubb")]).toBe(1);
  });

  it("sums branches into their federation, with WSKO's own branches under WSKO", () => {
    const series = buildUsageSeries(report(), "federation", labels);
    const total = (label: string) => series.totals[series.groups.findIndex(g => g.label === label)];
    expect(total("Svenska Shorinji Kempoförbundet")).toBe(5);
    expect(total("Norges Shorinji Kempo Forbund")).toBe(1);
    expect(total("WSKO")).toBe(2);
    expect(total("Borttagen klubb")).toBe(1);
    expect(total("Ingen klubb")).toBe(1);
  });

  it("folds everything past the cap into one gray group", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, name: `Branch ${i}` }));
    const byBranch = Object.fromEntries(many.map((b, i) => [b.id, 20 - i]));
    const series = buildUsageSeries(report({
      branches: many,
      byBranch,
      buckets: [{ start: "2026-10-22T00:00:00Z", people: 100, byBranch }],
    }), "branch", labels);

    expect(series.groups).toHaveLength(MaxEntitySeries + 1);
    const other = series.groups[series.groups.length - 1];
    expect(other).toEqual({ key: "other", label: "Övriga", kind: "other" });
    // The five smallest: 13 + 12 + 11 + 10 + 9.
    expect(series.totals[series.groups.length - 1]).toBe(55);
    expect(series.columns[0].values.reduce((a, b) => a + b, 0)).toBe(Object.values(byBranch).reduce((a, b) => a + b, 0));
  });

  // Folding one group into "other" would only rename it.
  it("does not fold a single group", () => {
    const eight = Array.from({ length: MaxEntitySeries + 1 }, (_, i) => ({ id: `b${i}`, name: `Branch ${i}` }));
    const byBranch = Object.fromEntries(eight.map(b => [b.id, 1]));
    const series = buildUsageSeries(report({ branches: eight, byBranch, buckets: [] }), "branch", labels);
    expect(series.groups.every(g => g.kind === "entity")).toBe(true);
    expect(series.groups).toHaveLength(MaxEntitySeries + 1);
  });
});

describe("assignColorSlots", () => {
  const entity = (key: string): UsageGroup => ({ key, label: key, kind: "entity" });

  // Color follows the entity, never its rank.
  it("keeps a group's color when others come and go", () => {
    const memory = new Map<string, number>();
    const first = assignColorSlots([entity("a"), entity("b"), entity("c")], memory);
    const second = assignColorSlots([entity("c"), entity("a")], memory);
    expect(second.get("a")).toBe(first.get("a"));
    expect(second.get("c")).toBe(first.get("c"));

    const third = assignColorSlots([entity("c"), entity("a"), entity("d")], memory);
    expect(third.get("d")).toBe(first.get("b")); // the freed slot, not a new one
  });

  it("never gives two groups on screen the same slot, nor the gray fold one at all", () => {
    const memory = new Map<string, number>();
    const groups = [...Array.from({ length: MaxEntitySeries }, (_, i) => entity(`g${i}`)), { key: "other", label: "Övriga", kind: "other" as const }];
    const slots = assignColorSlots(groups, memory);
    expect(new Set(slots.values()).size).toBe(MaxEntitySeries);
    expect(Math.max(...slots.values())).toBe(MaxEntitySeries);
    expect(slots.has("other")).toBe(false);
  });
});
