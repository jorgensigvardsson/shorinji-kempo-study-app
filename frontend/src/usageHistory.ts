import { getSyncManager } from "./sync/manager";
import type { HistoryEntry, HistoryWeek, PublicBranch, UsageReport } from "./sync/backend";

// The long view's data: fetched once, kept, and topped up.
//
// The history is append-only on the server — an entry, once written, never
// changes and is never removed — so whatever this browser has already fetched is
// still true. Each visit draws what it holds at once, then asks only for what was
// recorded since the newest entry. Branch names are kept too, so the cached
// entries can be labelled before the answer arrives, but unlike the entries they
// are replaced wholesale by every answer: a branch can be renamed.

// The version is in the key so a change to what an entry looks like can retire
// every old copy by bumping it, rather than having to make sense of them.
const CacheKey = "usage-history-v1";

interface Cached {
  cursor: string; // the newest recordedAt held
  items: HistoryEntry[];
  branches?: PublicBranch[];
}

// Storage is a convenience here, never a requirement: a private window, a full
// quota or a corrupt value all mean fetching everything, which is merely slower.
const readCache = (): Cached => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CacheKey) ?? "null") as Cached | null;
    if (parsed && typeof parsed.cursor === "string" && Array.isArray(parsed.items)) return parsed;
  } catch {
    // Fall through to empty.
  }
  return { cursor: "", items: [] };
};

// What this browser already holds, for drawing before the refresh lands. Null
// when it holds nothing, so the page can tell "nothing yet" from "nothing cached".
export const cachedUsageHistory = (): { items: HistoryEntry[]; branches: PublicBranch[] } | null => {
  const held = readCache();
  return held.items.length > 0 ? { items: held.items, branches: held.branches ?? [] } : null;
};

const writeCache = (cached: Cached): void => {
  try {
    localStorage.setItem(CacheKey, JSON.stringify(cached));
  } catch {
    // See readCache.
  }
};

// Merges a fetched page into what is held. The server's cursor is inclusive, so
// the newest entries held come back again; they are recognised by id.
export const mergeHistory = (held: HistoryEntry[], fetched: HistoryEntry[]): Cached => {
  const byId = new Map(held.map(e => [e.id, e]));
  for (const e of fetched) byId.set(e.id, e);
  const items = [...byId.values()];
  const cursor = items.reduce((newest, e) => (e.recordedAt > newest ? e.recordedAt : newest), "");
  return { cursor, items };
};

// ── the live view's last answer ────────────────────────────────────────────────

// The 30-day view is not append-only — today's bar grows all day — so its cache
// is only ever a placeholder: the last answer for the same period and bucket
// size, drawn while the fresh one is fetched, and replaced by it.
const liveKey = (days: number, bin: string) => `usage-live-v1:${days}:${bin}`;

export const cachedLiveUsage = (days: number, bin: string): UsageReport | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem(liveKey(days, bin)) ?? "null") as UsageReport | null;
    if (parsed && Array.isArray(parsed.buckets) && Array.isArray(parsed.branches)) return parsed;
  } catch {
    // As for the history: no cache is merely slower.
  }
  return null;
};

export const rememberLiveUsage = (days: number, bin: string, report: UsageReport): void => {
  try {
    localStorage.setItem(liveKey(days, bin), JSON.stringify(report));
  } catch {
    // See cachedLiveUsage.
  }
};

export const loadUsageHistory = async (): Promise<{ items: HistoryEntry[]; branches: PublicBranch[] }> => {
  const held = readCache();
  const page = await getSyncManager().adminUsageHistory(held.cursor || undefined);
  const merged = mergeHistory(held.items, page.items);
  writeCache({ ...merged, branches: page.branches });
  return { items: merged.items, branches: page.branches };
};

// ── turning entries into weeks ─────────────────────────────────────────────────

export interface HistoryWeekRow {
  start: string;
  week: HistoryWeek | null; // null for a week with events but no snapshot (yet)
  created: number;
  createdViaAdmin: number;
  deleted: number;
  moves: number;
  applications: number;
  approved: number;
  declined: number;
  withdrawn: number;
}

const WeekMs = 7 * 24 * 60 * 60 * 1000;

// The Monday 00:00 UTC on or before a moment, as the snapshots' starts are written.
export const weekStartOf = (at: string): string => {
  const d = new Date(at);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const sinceMonday = (new Date(day).getUTCDay() + 6) % 7;
  return new Date(day - sinceMonday * 24 * 60 * 60 * 1000).toISOString().replace(".000Z", "Z");
};

// One row per week from the first entry to the last, oldest first. Weeks with
// neither a snapshot nor an event are kept as empty rows so that a chart over
// them does not close up around a quiet week.
export const historyWeeks = (items: HistoryEntry[]): HistoryWeekRow[] => {
  const rows = new Map<string, HistoryWeekRow>();
  const row = (start: string): HistoryWeekRow => {
    let r = rows.get(start);
    if (!r) {
      r = { start, week: null, created: 0, createdViaAdmin: 0, deleted: 0, moves: 0, applications: 0, approved: 0, declined: 0, withdrawn: 0 };
      rows.set(start, r);
    }
    return r;
  };

  for (const e of items) {
    if (e.type === "week" && e.week) {
      row(e.week.start).week = e.week;
      continue;
    }
    const r = row(weekStartOf(e.at));
    switch (e.type) {
      case "account_created":
        r.created++;
        if (e.via === "admin") r.createdViaAdmin++;
        break;
      case "account_deleted":
        r.deleted++;
        break;
      case "transfer":
        r.moves++;
        break;
      case "application":
        if (e.outcome === "submitted") r.applications++;
        if (e.outcome === "approved") r.approved++;
        if (e.outcome === "declined") r.declined++;
        if (e.outcome === "withdrawn") r.withdrawn++;
        break;
    }
  }

  if (rows.size === 0) return [];
  const starts = [...rows.keys()].sort();
  const out: HistoryWeekRow[] = [];
  for (let t = Date.parse(starts[0]); t <= Date.parse(starts[starts.length - 1]); t += WeekMs) {
    out.push(row(new Date(t).toISOString().replace(".000Z", "Z")));
  }
  return out;
};

// How long deleted accounts had existed, over the given entries.
export const lifetimesOf = (items: HistoryEntry[]): Map<string, number> => {
  const out = new Map<string, number>();
  for (const e of items) {
    if (e.type === "account_deleted") out.set(e.lifetime ?? "unknown", (out.get(e.lifetime ?? "unknown") ?? 0) + 1);
  }
  return out;
};

// The shape buildUsageSeries draws, made from weekly rows and one measure of
// them — active people, or members. The per-branch "totals" are averages per
// week: distinct people cannot be summed over weeks, and an average is what the
// table beside the chart can honestly say.
export const weeksAsReport = (
  rows: HistoryWeekRow[],
  measure: (w: HistoryWeek) => { total: number; byBranch: Record<string, number> },
  branches: PublicBranch[],
): UsageReport => {
  const buckets = rows.map(r => {
    const m = r.week ? measure(r.week) : { total: 0, byBranch: {} };
    return { start: r.start, people: m.total, byBranch: m.byBranch };
  });
  const withData = rows.filter(r => r.week !== null).length || 1;
  const byBranch: Record<string, number> = {};
  for (const b of buckets) {
    for (const [branch, n] of Object.entries(b.byBranch)) byBranch[branch] = (byBranch[branch] ?? 0) + n / withData;
  }
  for (const branch of Object.keys(byBranch)) byBranch[branch] = Math.round(byBranch[branch] * 10) / 10;
  const people = Math.round((buckets.reduce((sum, b) => sum + b.people, 0) / withData) * 10) / 10;
  return {
    from: rows[0]?.start ?? "",
    to: rows[rows.length - 1]?.start ?? "",
    bin: "week",
    buckets,
    people,
    byBranch,
    branches,
  };
};

export const sumValues = (m: Record<string, number>): number => Object.values(m).reduce((a, b) => a + b, 0);
