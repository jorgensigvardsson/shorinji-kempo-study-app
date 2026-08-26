import { describe, expect, it } from "vitest";
import {
  administeredBranches, administeredFederations, branchAdmin, coversEverything,
  federationAdmin, isAnyAdmin, isGlobalAdmin, isKnownRole,
} from "./roles";

describe("roles", () => {
  it("recognises the vocabulary and nothing else", () => {
    for (const role of ["admin", "wsko_admin", "federation_admin:SE", "branch_admin:8f3c"]) {
      expect(isKnownRole(role)).toBe(true);
    }
    // A scoped role with nothing to scope it to is not a role — the same
    // reading the server takes, so the two cannot disagree about "branch_admin:".
    for (const role of ["", "wizard", "Admin", "branch_admin", "branch_admin:", "federation_admin:"]) {
      expect(isKnownRole(role)).toBe(false);
    }
  });

  it("builds role strings the server will parse back", () => {
    expect(federationAdmin("SE")).toBe("federation_admin:SE");
    expect(branchAdmin("8f3c")).toBe("branch_admin:8f3c");
    expect(isKnownRole(federationAdmin("SE"))).toBe(true);
    expect(isKnownRole(branchAdmin("8f3c"))).toBe(true);
  });

  // Broadcasting a push notification is a technical power, not an
  // organizational one: administering WSKO is not the same as being able to
  // notify every phone in it.
  it("keeps the global technical role separate from covering the organization", () => {
    expect(isGlobalAdmin(["admin"])).toBe(true);
    expect(isGlobalAdmin(["wsko_admin"])).toBe(false);
    expect(coversEverything(["wsko_admin"])).toBe(true);
    expect(coversEverything(["admin"])).toBe(true);
    expect(coversEverything([federationAdmin("SE")])).toBe(false);
  });

  it("offers the admin section to anybody holding a real role", () => {
    expect(isAnyAdmin([])).toBe(false);
    expect(isAnyAdmin(["wizard"])).toBe(false);
    expect(isAnyAdmin([branchAdmin("karlstad")])).toBe(true);
    expect(isAnyAdmin(["wizard", federationAdmin("SE")])).toBe(true);
  });

  it("lists what a role set administers directly", () => {
    const roles = ["admin", federationAdmin("SE"), branchAdmin("karlstad"), branchAdmin("oslo"), "junk"];
    expect(administeredFederations(roles)).toEqual(["SE"]);
    expect(administeredBranches(roles)).toEqual(["karlstad", "oslo"]);
    expect(administeredBranches(["branch_admin:"])).toEqual([]);
  });
});
