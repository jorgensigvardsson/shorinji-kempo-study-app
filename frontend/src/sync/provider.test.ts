import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSyncProvider, resetSyncProviderCache, setSyncProvider, subscribeSyncProvider } from "./provider";

beforeEach(() => {
  localStorage.clear();
  resetSyncProviderCache();
});

describe("syncProvider", () => {
  it("reads a device with no history at all as signed out", () => {
    expect(getSyncProvider()).toBe("local");
  });

  it("round-trips through localStorage", () => {
    setSyncProvider("backend");
    expect(localStorage.getItem("sync-provider")).toBe("backend");
    resetSyncProviderCache();
    expect(getSyncProvider()).toBe("backend");
  });

  it("notifies subscribers, and stops once unsubscribed", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeSyncProvider(p => seen.push(p));

    setSyncProvider("backend");
    setSyncProvider("local");
    unsubscribe();
    setSyncProvider("backend");

    expect(seen).toEqual(["backend", "local"]);
  });

  it("says nothing when set to the value it already has", () => {
    setSyncProvider("backend");
    const listener = vi.fn();
    subscribeSyncProvider(listener);
    setSyncProvider("backend");
    expect(listener).not.toHaveBeenCalled();
  });

  // The move out of the synced document must not sign anybody out.
  describe("adopting the value from where it used to live", () => {
    it("takes it from a document written before the move", () => {
      localStorage.setItem("app-data-document", JSON.stringify({ data: { syncProvider: "backend" } }));
      expect(getSyncProvider()).toBe("backend");
      // Adopted once and written to its own key, so the document can be sanitized
      // free of it from then on.
      expect(localStorage.getItem("sync-provider")).toBe("backend");
    });

    it("prefers its own key over the old document", () => {
      localStorage.setItem("sync-provider", "local");
      localStorage.setItem("app-data-document", JSON.stringify({ data: { syncProvider: "backend" } }));
      expect(getSyncProvider()).toBe("local");
    });

    // Documents from before cloud-storage sync was removed can still name a provider
    // that no longer exists.
    it("reads a provider that no longer exists as signed out", () => {
      for (const gone of ["onedrive", "google-drive", "dropbox"]) {
        localStorage.clear();
        resetSyncProviderCache();
        localStorage.setItem("app-data-document", JSON.stringify({ data: { syncProvider: gone } }));
        expect(getSyncProvider(), `${gone} should read as signed out`).toBe("local");
      }
    });

    it("survives a malformed legacy document", () => {
      localStorage.setItem("app-data-document", "{ not json");
      expect(getSyncProvider()).toBe("local");
    });

    it("survives a legacy document with no data at all", () => {
      localStorage.setItem("app-data-document", JSON.stringify({}));
      expect(getSyncProvider()).toBe("local");
    });
  });
});
