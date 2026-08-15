import type { GradeName, Video } from "./data";
import raw from "./assets/grading-exam-information.json";

// The grading manuals, and the one description of their shape.
//
// There used to be two: GradingTest and FreePractice each declared their own view of
// this file and reached it through `as unknown as`, the only type-safety escape hatches
// left in the frontend, sitting over the file that is edited most. Two hand-written
// shapes over one file can drift from the file and from each other, and neither had a
// way to notice — a change to the JSON failed at runtime, in one of the two
// components, maybe.
//
// The types below mirror `data/grading-exam-information.schema`, which is the source of
// truth and is now enforced against the data itself (see the test alongside this file).
// Change the schema and these together.
export interface Term {
  romaji: string;
  gloss?: string;
}

export interface Numbering {
  style: "bullet" | "numeric" | "paren" | "circled";
  value?: number;
}

export interface Annotation {
  // Optional in the schema, defaulting to kome. The renderer decides what to draw.
  marker?: "kome" | "asterisk";
  text: string;
}

export interface TechniqueGroup {
  context?: { kanji?: string; text?: string };
  techniques: Term[];
}

// The recursive node: a numbered or bulleted entry, with optional term, prose, points,
// annotations, technique groups, nested items and videos.
export interface Item {
  numbering?: Numbering;
  term?: Term;
  text?: string;
  description?: string;
  points?: number;
  annotations?: Annotation[];
  techniqueGroups?: TechniqueGroup[];
  items?: Item[];
  videos?: Video[];
}

export interface Section {
  marker?: string;
  term?: Term;
  title: string;
  items: Item[];
}

export interface GradeManual {
  term?: Term;
  title: string;
  sections: Section[];
}

// The file carries a "$schema" pointer alongside the grades, so it is not simply a map
// of grade to manual — the previous `Partial<Record<GradeName, GradeManual>>` was wrong
// about that, and only got away with it because every lookup happened to use a real
// grade name. Dropping it here keeps that from mattering again.
function withoutSchemaPointer(source: Record<string, unknown>): Record<string, unknown> {
  const manuals = { ...source };
  delete manuals.$schema;
  return manuals;
}

export const gradingManuals = withoutSchemaPointer(raw) as Partial<Record<GradeName, GradeManual>>;

export function gradingManualFor(grade: GradeName | undefined): GradeManual | undefined {
  return grade ? gradingManuals[grade] : undefined;
}
