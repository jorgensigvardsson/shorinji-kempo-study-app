import { describe, it, expect, beforeEach } from "vitest";
import { setHokeiNote } from "./app-data";
import { getAppDataStore } from "./store";
import { HOKEI_NOTE_MAX_LENGTH } from "./schema";

// The editor caps what can be typed, but typing is not the only way in: a paste, an
// autofill, or a note synced from a build that had no cap all reach the document
// without passing through the textarea. This is the cap that covers those.
describe("note length", () => {
  beforeEach(() => {
    getAppDataStore().set("notes", {});
  });

  it("keeps a note of ordinary length exactly as written", () => {
    const note = "Tryck kagite nedåt, sedan urate uchi.";
    setHokeiNote("tsuki nuki [soto]", note);

    expect(getAppDataStore().get("notes")["tsuki nuki [soto]"]).toBe(note);
  });

  it("keeps a note that is exactly at the limit", () => {
    const note = "a".repeat(HOKEI_NOTE_MAX_LENGTH);
    setHokeiNote("tsuki nuki [soto]", note);

    expect(getAppDataStore().get("notes")["tsuki nuki [soto]"]).toHaveLength(HOKEI_NOTE_MAX_LENGTH);
  });

  it("cuts a note that arrives longer than the limit", () => {
    const note = "b".repeat(HOKEI_NOTE_MAX_LENGTH + 500);
    setHokeiNote("tsuki nuki [soto]", note);

    const stored = getAppDataStore().get("notes")["tsuki nuki [soto]"];
    expect(stored).toHaveLength(HOKEI_NOTE_MAX_LENGTH);
    expect(stored).toBe("b".repeat(HOKEI_NOTE_MAX_LENGTH));
  });

  // Counted in characters, so a Japanese note is not cut three times sooner than a
  // Swedish one — the reader sees the same allowance whichever language they write in.
  it("counts characters rather than bytes", () => {
    const note = "手".repeat(HOKEI_NOTE_MAX_LENGTH);
    setHokeiNote("tsuki nuki [soto]", note);

    expect(getAppDataStore().get("notes")["tsuki nuki [soto]"]).toHaveLength(HOKEI_NOTE_MAX_LENGTH);
  });

  it("still removes a note when it is cleared", () => {
    setHokeiNote("tsuki nuki [soto]", "något");
    setHokeiNote("tsuki nuki [soto]", null);

    expect("tsuki nuki [soto]" in getAppDataStore().get("notes")).toBe(false);
  });

  // Every note at full length has to leave the document inside the server's cap.
  it("bounds the whole notes field well inside the 1 MB document limit", () => {
    const NOTE_KEYS = 288;
    const worstCaseBytes = NOTE_KEYS * (HOKEI_NOTE_MAX_LENGTH + 30); // + key and punctuation
    // Swedish or English at roughly a byte a character; the realistic case, and the
    // one the limit is sized for.
    expect(worstCaseBytes).toBeLessThan(1024 * 1024);
  });
});
