import { describe, it, expect } from "vitest";
import manuals from "./grading-exam-information.json";
import baseline from "./grading-completion-id-baseline.json";
import type { GradeManual, Item } from "../grading-exam-information";

// A ticked grading item is stored in the user's synced document under
// `${grade}|${item.id}`, so an id is the name of something that already exists on
// other people's devices. Change one and the tick saved against it is orphaned: the
// item comes back unticked, the old entry stays in the document forever, and nothing
// anywhere reports that it happened.
//
// The ids were derived from the item's romaji until they were frozen, with a
// positional `item-N` where an item had no term. That is why correcting a spelling in
// the source used to be enough to clear people's progress — the `sashikae sokuō geri`
// correction on 2026-08-16 landed one nesting level away from doing exactly that.
// These tests exist so the next one cannot.
const gradeManuals = manuals as unknown as Record<string, GradeManual>;
const baselineIds = baseline as Record<string, Record<string, string | null>>;

// The items a completion can be stored against, mirroring the traversal in
// GradingTest.tsx: the gakka kamoku items, and the kiso kamoku sub-items.
function keyedItems(manual: GradeManual): Item[] {
  const found: Item[] = [];
  for (const section of manual.sections ?? []) {
    const term = section.term?.romaji;
    if (term === "gakka kamoku") {
      found.push(...(section.items ?? []));
    } else if (term === "gijutsu kamoku") {
      for (const item of section.items ?? []) {
        if (item.term?.romaji === "kiso kamoku") found.push(...(item.items ?? []));
      }
    }
  }
  return found;
}

const grades = Object.keys(gradeManuals).filter(key => key !== "$schema");

describe("grading completion ids", () => {
  it("gives every tickable item an id", () => {
    const missing: string[] = [];
    for (const grade of grades) {
      keyedItems(gradeManuals[grade]).forEach((item, position) => {
        if (!item.id) missing.push(`${grade} position ${position}: ${item.term?.romaji ?? "(no term)"}`);
      });
    }
    // Without one the item silently loses its checkbox, since gradingCompletionKey
    // returns undefined rather than inventing a key several items would share.
    expect(missing, `tickable items without an id: ${missing.join(", ")}`).toHaveLength(0);
  });

  it("uses each id at most once per grade", () => {
    const duplicates: string[] = [];
    for (const grade of grades) {
      const seen = new Set<string>();
      for (const item of keyedItems(gradeManuals[grade])) {
        if (!item.id) continue;
        if (seen.has(item.id)) duplicates.push(`${grade}|${item.id}`);
        seen.add(item.id);
      }
    }
    // Two items sharing an id share a tick: ticking one ticks the other.
    expect(duplicates, `ids used twice within a grade: ${duplicates.join(", ")}`).toHaveLength(0);
  });

  // The one that catches a rename. Ids the baseline recorded have to still be there.
  //
  // A failure is not a broken test — it means saved progress has been orphaned, and
  // the question to answer first is what happens to the ticks already stored against
  // the old id. Correcting the romaji beside an id is always fine and never trips
  // this; the id is deliberately not derived from it any more.
  it("keeps every id it has ever handed out", () => {
    const gone: string[] = [];
    for (const grade of grades) {
      const present = new Set(keyedItems(gradeManuals[grade]).map(item => item.id));
      for (const id of Object.keys(baselineIds[grade] ?? {})) {
        if (!present.has(id)) gone.push(`${grade}|${id}`);
      }
    }
    expect(
      gone,
      `${gone.length} id(s) no longer present, orphaning saved ticks: ${gone.slice(0, 5).join(", ")}${gone.length > 5 ? " …" : ""}`
    ).toHaveLength(0);
  });

  it("covers every grade the baseline knows about", () => {
    const missingGrades = Object.keys(baselineIds).filter(grade => !grades.includes(grade));
    expect(missingGrades, `grades no longer in the manual: ${missingGrades.join(", ")}`).toHaveLength(0);
  });
});
