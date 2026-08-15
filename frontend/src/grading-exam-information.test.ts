import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import raw from "./assets/grading-exam-information.json";
// Imported as text from the path the data file points at, so the schema being enforced
// is the one shipped in the repo — a second, drifting copy could not satisfy this.
import schemaText from "../data/grading-exam-information.schema?raw";
import { gradingManualFor, gradingManuals } from "./grading-exam-information";
import type { GradeName } from "./data";

// The schema has existed since May and enforced nothing. This is what makes it real:
// the data file is edited constantly as dan-grade material is transcribed, and until
// now a mistake in it surfaced at runtime, in one of the components that read it, if
// you happened to open the right page.
const schema = JSON.parse(schemaText) as object;

const GRADE_NAMES: GradeName[] = [
  "1 kyū", "2 kyū", "3 kyū", "4 kyū", "5 kyū", "6 kyū",
  "shodan", "nidan", "sandan", "yondan", "godan", "rokudan", "nanadan", "hachidan", "kudan",
];

describe("grading-exam-information.json", () => {
  it("matches the schema it declares", () => {
    // Validates what the module actually hands the app — the manuals, with the $schema
    // pointer already dropped — rather than a separately derived copy of it.
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    const valid = validate(gradingManuals);

    // Report where the failure is, not just that there was one — the file is 160 KB.
    const errors = (validate.errors ?? [])
      .map(e => `${e.dataPath || "(root)"} ${e.message}`)
      .slice(0, 20);
    expect(valid, `schema violations:\n${errors.join("\n")}`).toBe(true);
  });

  it("declares the schema this test validates against", () => {
    expect((raw as { $schema?: string }).$schema).toBe("../../data/grading-exam-information.schema");
  });

  // The manuals are keyed by grade, and the accessor types them that way. A key that is
  // not a grade would be read as one and silently never match.
  it("is keyed only by grade names", () => {
    const keys = Object.keys(raw).filter(key => key !== "$schema");
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(GRADE_NAMES, `"${key}" is not a grade name`).toContain(key);
    }
  });

  it("does not expose the schema pointer as if it were a manual", () => {
    expect("$schema" in gradingManuals).toBe(false);
  });

  it("returns a manual for a grade the file covers", () => {
    const manual = gradingManualFor("shodan");
    expect(manual).toBeDefined();
    expect(typeof manual?.title).toBe("string");
    expect(Array.isArray(manual?.sections)).toBe(true);
  });

  it("returns nothing for a grade the file does not cover, or for no grade at all", () => {
    // The file stops at rokudan; the higher dan grades exist as names but have no manual.
    expect(gradingManualFor("kudan")).toBeUndefined();
    expect(gradingManualFor(undefined)).toBeUndefined();
  });
});
