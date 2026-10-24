import type { PublicBranch, UsageReport } from "./sync/backend";

// Turns a usage report into what the chart and the tables draw: a set of groups,
// and one column per bucket with a value for each group.
//
// Kept apart from the page so the arithmetic can be tested without rendering
// anything — it is where a miscount would hide.

export type UsageGrouping = "none" | "branch" | "federation";

export interface UsageGroup {
  key: string;
  label: string;
  // "other" is the fold for everything past the series cap. It is drawn in the
  // neutral gray rather than a categorical hue, because it is not an entity.
  kind: "entity" | "other";
}

export interface UsageColumn {
  start: string;
  // Distinct people in the bucket, as the server counted them. The group values
  // can sum to slightly more: somebody who moved branch mid-week is in both.
  people: number;
  values: number[]; // aligned with groups
}

export interface UsageSeries {
  groups: UsageGroup[]; // stack order, bottom first: largest at the base
  columns: UsageColumn[];
  totals: number[]; // per group, over the whole window, aligned with groups
}

// The categorical palette has eight slots; seven go to groups and the eighth
// place is the gray "other". A ninth hue is never generated — past the cap the
// smallest groups fold together, which is honest about what a reader can tell
// apart.
export const MaxEntitySeries = 7;

export interface UsageLabels {
  all: string; // the single series when nothing is grouped
  noBranch: string; // usage that named no branch
  deleted: string; // a branch id the server no longer knows
  other: string; // the fold past the cap
  wsko: string; // branches attached directly to WSKO
}

// Which group a branch id counts towards under a grouping. The prefixes keep a
// branch and a federation from ever sharing a key, and with it a color.
const groupOf = (branchId: string, grouping: UsageGrouping, branches: Map<string, PublicBranch>, labels: UsageLabels): { key: string; label: string } => {
  if (branchId === "") return { key: "none", label: labels.noBranch };
  const branch = branches.get(branchId);
  if (branch === undefined) return { key: "deleted", label: labels.deleted };
  if (grouping === "branch") return { key: `branch:${branch.id}`, label: branch.name };
  if (!branch.federationId) return { key: "federation:", label: labels.wsko };
  return { key: `federation:${branch.federationId}`, label: branch.federationName ?? branch.federationId };
};

export const buildUsageSeries = (report: UsageReport, grouping: UsageGrouping, labels: UsageLabels): UsageSeries => {
  if (grouping === "none") {
    return {
      groups: [{ key: "all", label: labels.all, kind: "entity" }],
      columns: report.buckets.map(b => ({ start: b.start, people: b.people, values: [b.people] })),
      totals: [report.people],
    };
  }

  const branches = new Map(report.branches.map(b => [b.id, b]));

  // Window totals per group decide the order and who survives the cap. Summing
  // branches into a federation is exact unless somebody moved between two of its
  // branches during the window, in which case they are counted in both.
  const totalsByKey = new Map<string, { label: string; people: number }>();
  for (const [branchId, people] of Object.entries(report.byBranch)) {
    const { key, label } = groupOf(branchId, grouping, branches, labels);
    const entry = totalsByKey.get(key) ?? { label, people: 0 };
    entry.people += people;
    totalsByKey.set(key, entry);
  }

  // Largest first, then by label so ties do not reshuffle between reloads.
  const ranked = [...totalsByKey.entries()].sort(([, a], [, b]) =>
    b.people - a.people || a.label.localeCompare(b.label));

  // Folding a single group into "other" would only rename it, so the cap bites
  // only when at least two would go.
  const overCap = ranked.length > MaxEntitySeries + 1;
  const kept = overCap ? ranked.slice(0, MaxEntitySeries) : ranked;
  const groups: UsageGroup[] = kept.map(([key, { label }]) => ({ key, label, kind: "entity" }));
  if (overCap) groups.push({ key: "other", label: labels.other, kind: "other" });

  const index = new Map(groups.map((g, i) => [g.key, i]));
  const slotOf = (branchId: string): number =>
    index.get(groupOf(branchId, grouping, branches, labels).key) ?? index.get("other")!;

  const columns = report.buckets.map(b => {
    const values = groups.map(() => 0);
    for (const [branchId, people] of Object.entries(b.byBranch)) values[slotOf(branchId)] += people;
    return { start: b.start, people: b.people, values };
  });

  const totals = groups.map(() => 0);
  for (const [branchId, people] of Object.entries(report.byBranch)) totals[slotOf(branchId)] += people;

  return { groups, columns, totals };
};

// Gives each group a palette slot (1–7) and keeps it. Color follows the entity,
// never its rank: switching from 30 days to 7 must not repaint a branch because
// another one dropped out of the top seven. `memory` is held by the page for as
// long as it is open, and is mutated here.
//
// A group that needs a slot takes the lowest one no group on screen is using,
// reclaiming it from a group remembered but not currently shown.
export const assignColorSlots = (groups: UsageGroup[], memory: Map<string, number>): Map<string, number> => {
  const onScreen = new Map<string, number>();
  for (const g of groups) {
    const remembered = memory.get(g.key);
    if (g.kind === "entity" && remembered !== undefined) onScreen.set(g.key, remembered);
  }
  for (const g of groups) {
    if (g.kind !== "entity" || onScreen.has(g.key)) continue;
    const used = new Set(onScreen.values());
    let slot = 1;
    while (used.has(slot)) slot++;
    for (const [key, s] of memory) if (s === slot) memory.delete(key);
    memory.set(g.key, slot);
    onScreen.set(g.key, slot);
  }
  return onScreen;
};
