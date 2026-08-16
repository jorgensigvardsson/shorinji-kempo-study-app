import { beforeEach, describe, expect, it } from "vitest";
import { experimentalEmbuDraftStorageKey, loadExperimentalEmbuDraft } from "./experimental-embu-draft";

describe("experimental Embu draft persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores drafts under a separate local-only key", () => {
    const data = loadExperimentalEmbuDraft();
    data.save({ sequences: [] });

    expect(JSON.parse(localStorage.getItem(experimentalEmbuDraftStorageKey)!)).toEqual({
      sequences: [],
    });
    expect(localStorage.getItem("app-data-document")).toBeNull();
  });

  it("moves an existing local draft out of the old app-data document", () => {
    const draft = {
      notes: "Bevara lokalt",
      steps: [{
        id: "old-step",
        hokeiName: "gyaku gote",
        grade: "5 kyū",
        week: 3,
        momentIndex: 0,
        transition: "Byt fot",
      }],
    };
    localStorage.setItem("app-data-document", JSON.stringify({ data: { embuDraft: draft } }));

    const expected = {
      sequences: [{
        id: "sequence-old-step",
        hokeis: [{
          id: "old-step",
          hokeiName: "gyaku gote",
          grade: "5 kyū",
          week: 3,
          momentIndex: 0,
          comment: "Byt fot\n\nBevara lokalt",
        }],
      }],
    };
    expect(loadExperimentalEmbuDraft().data).toEqual(expected);
    expect(JSON.parse(localStorage.getItem(experimentalEmbuDraftStorageKey)!)).toEqual(expected);
  });

  it("moves sequence and overall notes onto techniques without losing either", () => {
    const draft = {
      notes: "Rytm",
      sequences: [{
        id: "sequence-one",
        hokeis: [{
          id: "hokei-one",
          hokeiName: "shita uke geri",
          grade: "5 kyū",
          week: 3,
          momentIndex: 1,
        }],
        transition: "Lugn övergång",
      }],
    };
    localStorage.setItem(experimentalEmbuDraftStorageKey, JSON.stringify(draft));

    expect(loadExperimentalEmbuDraft().data).toEqual({
      sequences: [{
        id: "sequence-one",
        hokeis: [{
          id: "hokei-one",
          hokeiName: "shita uke geri",
          grade: "5 kyū",
          week: 3,
          momentIndex: 1,
          comment: "Lugn övergång\n\nRytm",
        }],
      }],
    });
  });

  it("holds an older overall note until the first technique can receive it", () => {
    localStorage.setItem(experimentalEmbuDraftStorageKey, JSON.stringify({
      notes: "Idé till senare",
      sequences: [],
    }));

    expect(loadExperimentalEmbuDraft().data).toEqual({
      sequences: [],
      pendingComment: "Idé till senare",
    });
  });

  it("keeps an existing per-technique comment draft unchanged", () => {
    const draft = {
      sequences: [{
        id: "sequence-one",
        hokeis: [{
          id: "hokei-one",
          hokeiName: "shita uke geri",
          grade: "5 kyū",
          week: 3,
          momentIndex: 1,
          comment: "Första raden\nAndra raden",
        }],
      }],
    };
    localStorage.setItem(experimentalEmbuDraftStorageKey, JSON.stringify(draft));

    expect(loadExperimentalEmbuDraft().data).toEqual(draft);
  });

  it("keeps empty sequence slots so an unfinished plan does not shift after reload", () => {
    const draft = {
      sequences: [
        { id: "sequence-one", hokeis: [] },
        {
          id: "sequence-two",
          hokeis: [{
            id: "hokei-one",
            hokeiName: "gyaku gote",
            grade: "5 kyū",
            week: 3,
            momentIndex: 0,
            comment: "",
          }],
        },
      ],
    };
    localStorage.setItem(experimentalEmbuDraftStorageKey, JSON.stringify(draft));

    expect(loadExperimentalEmbuDraft().data).toEqual(draft);
  });
});
