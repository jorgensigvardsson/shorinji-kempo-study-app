import { describe, it, expect } from "vitest";
import kamokuhyo from "./kamokuhyo.json";
import baseline from "./kamokuhyo-id-baseline.json";

// A reader's note and self-assessment for a technique are stored in their synced
// document under the moment's id, so an id names something that already exists on
// other people's devices. Change one and the note saved against it is orphaned — the
// card comes back blank, the old entry lingers in the document, and nothing says so.
//
// These ids were the `hokei_name` until they were frozen, which is what made the
// collision possible: eleven names cover two or three different moments, and all of
// them shared one note. The ids for those carry the variations that tell them apart.
interface Moment { id?: string; type?: string; hokei_name?: string; name?: string; variations?: string[] }

const momentName = (moment: Moment): string | undefined => moment.hokei_name ?? moment.name;

function moments(node: unknown, found: Moment[] = []): Moment[] {
  if (Array.isArray(node)) {
    for (const child of node) moments(child, found);
  } else if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (typeof record.hokei_name === "string" || record.type === "kihon_moment") found.push(record as Moment);
    for (const value of Object.values(record)) moments(value, found);
  }
  return found;
}

const all = moments(kamokuhyo);
const baselineIds = baseline as Record<string, string>;

describe("kamokuhyo hokei ids", () => {
  it("keeps the confirmed kōbōgi exercise under Kihon without changing its id", () => {
    const kobo = all.find(moment => moment.id === "kōbōgi (furi zuki & kusshin uke)");
    expect(kobo?.type).toBe("kihon_moment");
    expect(momentName(kobo ?? {})).toBe("kōbōgi (furi zuki & kusshin uke)");
  });

  it("gives every hokei moment an id", () => {
    const missing = all.filter(moment => !moment.id).map(moment => momentName(moment) ?? "(unnamed)");
    expect(missing, `moments without an id: ${missing.join(", ")}`).toHaveLength(0);
  });

  // The bug this whole change exists to fix: two moments sharing a key share a note.
  it("uses each id exactly once", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const moment of all) {
      if (!moment.id) continue;
      if (seen.has(moment.id)) duplicates.push(moment.id);
      seen.add(moment.id);
    }
    expect(duplicates, `ids used more than once: ${duplicates.join(", ")}`).toHaveLength(0);
  });

  it("keeps every id meaning the technique it has always meant", () => {
    const changed = all
      .filter(moment => moment.id && baselineIds[moment.id] !== undefined)
      .filter(moment => baselineIds[moment.id!] !== momentName(moment))
      .map(moment => `${moment.id}: was ${baselineIds[moment.id!]}, now ${momentName(moment)}`);
    expect(
      changed,
      `${changed.length} id(s) changed meaning: ${changed.slice(0, 5).join("; ")}${changed.length > 5 ? " …" : ""}`
    ).toHaveLength(0);
  });

  it("still holds every id it has handed out", () => {
    const present = new Set(all.map(moment => moment.id));
    const gone = Object.keys(baselineIds).filter(id => !present.has(id));
    expect(
      gone,
      `${gone.length} id(s) gone, orphaning saved notes and ratings: ${gone.slice(0, 5).join(", ")}${gone.length > 5 ? " …" : ""}`
    ).toHaveLength(0);
  });
});
