import { beforeEach, describe, expect, it } from "vitest";
import { experimentalEmbuDraftStorageKey, loadExperimentalEmbuDraft } from "./experimental-embu-draft";

describe("experimental Embu draft persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores drafts under a separate local-only key", () => {
    const data = loadExperimentalEmbuDraft();
    data.save({ notes: "Tempo", steps: [] });

    expect(JSON.parse(localStorage.getItem(experimentalEmbuDraftStorageKey)!)).toEqual({
      notes: "Tempo",
      steps: [],
    });
    expect(localStorage.getItem("app-data-document")).toBeNull();
  });

  it("moves an existing local draft out of the old app-data document", () => {
    const draft = { notes: "Bevara lokalt", steps: [] };
    localStorage.setItem("app-data-document", JSON.stringify({ data: { embuDraft: draft } }));

    expect(loadExperimentalEmbuDraft().data).toEqual(draft);
    expect(JSON.parse(localStorage.getItem(experimentalEmbuDraftStorageKey)!)).toEqual(draft);
  });
});
