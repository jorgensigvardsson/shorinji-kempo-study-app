import { describe, it, expect } from "vitest";
import wordList from "./word-list.json";
import baseline from "./word-list-id-baseline.json";
import type { WordListEntry } from "../data";

// A flashcard's "known" flag is stored in the user's synced document under the
// word's id, so an id is not a label on a row — it is the name of something that
// already exists on other people's devices. Change what an id means and every flag
// saved against it silently moves to a different word: nothing is lost, nothing
// looks wrong, and the app cheerfully reports that the user knows a word they have
// never seen.
//
// The ids used to be positions (`index`, 0 to 537, matching the array exactly), so
// inserting a word in the middle and renumbering was the natural thing to do. These
// tests exist to make that stop being possible quietly.
const entries = wordList as WordListEntry[];
const baselineIds = baseline as Record<string, string>;

describe("word list ids", () => {
  it("gives every entry an id", () => {
    const missing = entries
      .map((entry, position) => ({ entry, position }))
      .filter(({ entry }) => typeof entry.id !== "number")
      .map(({ entry, position }) => `${position}: ${entry.romaji ?? "(no romaji)"}`);
    expect(missing, `entries without an id: ${missing.join(", ")}`).toHaveLength(0);
  });

  it("uses each id exactly once", () => {
    const seen = new Map<number, string>();
    const duplicates: string[] = [];
    for (const entry of entries) {
      const previous = seen.get(entry.id);
      if (previous !== undefined) duplicates.push(`${entry.id}: ${previous} / ${entry.romaji}`);
      else seen.set(entry.id, entry.romaji ?? "(no romaji)");
    }
    expect(duplicates, `ids used twice: ${duplicates.join(", ")}`).toHaveLength(0);
  });

  // The one that catches a renumbering. Every id the baseline knows about has to
  // still mean the same word; ids beyond it are new entries and unconstrained.
  //
  // A failure here is not a broken test. It means an id changed meaning, and the
  // question to answer before touching this file is what happens to the flags users
  // have already saved against it. Correcting a word's spelling in place is fine and
  // wants the baseline updated to match; giving an existing word a different number
  // is the thing that must not ship.
  it("keeps every id meaning the word it has always meant", () => {
    const changed = entries
      .filter(entry => baselineIds[String(entry.id)] !== undefined)
      .filter(entry => baselineIds[String(entry.id)] !== entry.romaji)
      .map(entry => `${entry.id}: was ${baselineIds[String(entry.id)]}, now ${entry.romaji}`);
    // A single renumbering shifts everything after it, so the list runs to hundreds.
    // The first few say what happened; the count says how far it reached.
    expect(
      changed,
      `${changed.length} id(s) changed meaning: ${changed.slice(0, 5).join("; ")}${changed.length > 5 ? " …" : ""}`
    ).toHaveLength(0);
  });

  it("accounts for every id the baseline recorded", () => {
    const present = new Set(entries.map(entry => String(entry.id)));
    const gone = Object.keys(baselineIds).filter(id => !present.has(id));
    // Removing a word is allowed — it leaves a harmless orphaned flag in the
    // documents of users who had marked it known. It should be a decision, though,
    // rather than something a renumbering does on the way past.
    expect(
      gone,
      `${gone.length} id(s) no longer in the word list: ${gone.slice(0, 5).map(id => `${id} (${baselineIds[id]})`).join(", ")}${gone.length > 5 ? " …" : ""}`
    ).toHaveLength(0);
  });

  // New words go on the end of the numbering, wherever they sit in the file.
  it("never hands a new entry an id below the baseline", () => {
    const highestKnown = Math.max(...Object.keys(baselineIds).map(Number));
    const reused = entries
      .filter(entry => baselineIds[String(entry.id)] === undefined && entry.id <= highestKnown)
      .map(entry => `${entry.id}: ${entry.romaji}`);
    expect(reused, `ids reused from below the baseline's highest (${highestKnown}): ${reused.join(", ")}`).toHaveLength(0);
  });
});
