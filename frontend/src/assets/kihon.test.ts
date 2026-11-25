import { describe, it, expect } from "vitest";
import kihon from "./kihon.json";
import baseline from "./kihon-id-baseline.json";
import type { KihonNode } from "../data";

// A kihon id is what other pages link to and what anything saved against a technique
// is stored under, so once shipped it names something outside this file. Change one
// and the link or the saved state points at nothing, and nothing says so.
//
// Most ids are simply the name. Eleven names are shared — a heading and the first
// technique under it (hiki ashi, kaishin, zu tsuki …), the chokusen/kyokusen headings
// under both tsuki waza and keri waza, and tai gamae, which is two different words
// (体構え and 対構え). Those carry their parent's name in brackets.
const nodes: KihonNode[] = [];
const collect = (list: KihonNode[]) => list.forEach(node => { nodes.push(node); collect(node.children ?? []); });
collect(kihon as KihonNode[]);

const baselineIds = baseline as Record<string, string>;

describe("kihon ids", () => {
  it("gives every node an id", () => {
    const missing = nodes.filter(node => !node.id).map(node => node.name);
    expect(missing, `nodes without an id: ${missing.join(", ")}`).toHaveLength(0);
  });

  // A new technique whose name is already taken is what this catches.
  it("uses each id exactly once", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const node of nodes) {
      if (seen.has(node.id)) duplicates.push(node.id);
      seen.add(node.id);
    }
    expect(duplicates, `ids used more than once: ${duplicates.join(", ")}`).toHaveLength(0);
  });

  // Correcting a name's spelling in place is fine and wants the baseline updated to
  // match; pointing an existing id at a different technique is what must not ship.
  it("keeps every id meaning the technique it has always meant", () => {
    const changed = nodes
      .filter(node => baselineIds[node.id] !== undefined && baselineIds[node.id] !== node.name)
      .map(node => `${node.id}: was ${baselineIds[node.id]}, now ${node.name}`);
    expect(changed, `${changed.length} id(s) changed meaning: ${changed.slice(0, 5).join("; ")}`).toHaveLength(0);
  });

  it("still holds every id it has handed out", () => {
    const present = new Set(nodes.map(node => node.id));
    const gone = Object.keys(baselineIds).filter(id => !present.has(id));
    expect(gone, `${gone.length} id(s) gone: ${gone.slice(0, 5).join(", ")}`).toHaveLength(0);
  });
});
