import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageBackend } from "./backend";

const KEY = "test-backend-key";
const DEFAULT = { value: "default" };

beforeEach(() => {
  localStorage.removeItem(KEY);
});

describe("LocalStorageBackend — load", () => {
  it("returns the default document when nothing is stored", () => {
    const backend = new LocalStorageBackend<typeof DEFAULT>(KEY);
    expect(backend.load(DEFAULT)).toEqual(DEFAULT);
  });

  it("returns the parsed stored value when one exists", () => {
    localStorage.setItem(KEY, JSON.stringify({ value: "stored" }));
    const backend = new LocalStorageBackend<typeof DEFAULT>(KEY);
    expect(backend.load(DEFAULT)).toEqual({ value: "stored" });
  });

  it("returns the default document when the stored value is invalid JSON", () => {
    localStorage.setItem(KEY, "not-valid-json{{{");
    const backend = new LocalStorageBackend<typeof DEFAULT>(KEY);
    expect(backend.load(DEFAULT)).toEqual(DEFAULT);
  });
});

describe("LocalStorageBackend — save", () => {
  it("persists the document so a subsequent load returns it", () => {
    const backend = new LocalStorageBackend<typeof DEFAULT>(KEY);
    backend.save({ value: "saved" });
    expect(backend.load(DEFAULT)).toEqual({ value: "saved" });
  });

  it("overwrites the previously stored value", () => {
    const backend = new LocalStorageBackend<typeof DEFAULT>(KEY);
    backend.save({ value: "first" });
    backend.save({ value: "second" });
    expect(backend.load(DEFAULT)).toEqual({ value: "second" });
  });

  it("stores the document under the configured key", () => {
    const backend = new LocalStorageBackend<typeof DEFAULT>(KEY);
    backend.save({ value: "check" });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ value: "check" });
  });
});
