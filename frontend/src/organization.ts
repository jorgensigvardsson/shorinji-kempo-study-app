import { getSyncManager } from "./sync/manager";
import type { AdminOrgBranch, AdminOrgFederation, AdminOrgTree } from "./sync/backend";
import { administeredBranches, administeredFederations, coversEverything, isAnyAdmin } from "./roles";

// The organization as anyone may see it, with whatever more the caller's own
// roles add. Two sources, because there are two audiences in one page:
//
//   - GET /auth/org/branches is public — the same list somebody registering
//     picks their club from — and so is the whole shape of the organization:
//     every branch and the federation it is in. Organization names are public.
//   - GET /auth/admin/org adds what only an admin may know: member counts for
//     the branches they cover, and federations they cover that have no branch
//     yet, which the public list cannot show since it is a list of branches.
//
// The second is laid over the first rather than replacing it, so a federation
// admin sees the whole organization like everybody else, with their own corner
// of it filled in. Counts are left out wherever the caller does not cover the
// branch, which is what MemberCount already takes "absent" to mean.
export async function loadOrganization(): Promise<AdminOrgTree> {
  const roles = getSyncManager().getBackendUserInfo()?.roles ?? [];
  const [publicBranches, adminTree] = await Promise.all([
    getSyncManager().listBranches(),
    // An admin whose part of the tree cannot be fetched still gets the public
    // organization: the extra detail is a garnish, not the page.
    isAnyAdmin(roles) ? getSyncManager().adminOrgTree().catch(() => null) : Promise.resolve(null),
  ]);

  const federations = new Map<string, AdminOrgFederation>();
  const wskoBranches: AdminOrgBranch[] = [];
  for (const b of publicBranches) {
    const branch: AdminOrgBranch = { id: b.id, name: b.name };
    if (!b.federationId) {
      wskoBranches.push(branch);
      continue;
    }
    let federation = federations.get(b.federationId);
    if (federation === undefined) {
      federation = { id: b.federationId, name: b.federationName ?? b.federationId, branches: [] };
      federations.set(b.federationId, federation);
    }
    federation.branches.push(branch);
  }

  if (adminTree !== null) {
    const overlay = (into: AdminOrgBranch[], from: AdminOrgBranch[]) => {
      for (const known of from) {
        const existing = into.find(b => b.id === known.id);
        if (existing !== undefined) existing.memberCount = known.memberCount;
        else into.push({ ...known });
      }
    };
    for (const f of adminTree.federations) {
      let federation = federations.get(f.id);
      if (federation === undefined) {
        federation = { id: f.id, name: f.name, branches: [] };
        federations.set(f.id, federation);
      }
      overlay(federation.branches, f.branches);
    }
    overlay(wskoBranches, adminTree.wskoBranches);
  }

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const sorted = [...federations.values()].sort(byName);
  for (const f of sorted) f.branches.sort(byName);
  wskoBranches.sort(byName);
  return { federations: sorted, wskoBranches };
}

// What the caller's roles cover, as the organization pages need to ask it.
// These decide what to offer; the server decides again on every request.
export interface OrgAuthority {
  atWSKO: boolean;
  coversFederation: (federationId: string) => boolean;
  // A branch is covered through its federation as well as directly. "" is a
  // branch directly under WSKO, which only WSKO covers from above.
  coversBranch: (branchId: string, federationId: string) => boolean;
}

export function orgAuthority(): OrgAuthority {
  const roles = getSyncManager().getBackendUserInfo()?.roles ?? [];
  const atWSKO = coversEverything(roles);
  const ownFederations = administeredFederations(roles);
  const ownBranches = administeredBranches(roles);
  const coversFederation = (federationId: string) =>
    atWSKO || (federationId !== "" && ownFederations.includes(federationId));
  return {
    atWSKO,
    coversFederation,
    coversBranch: (branchId, federationId) => coversFederation(federationId) || ownBranches.includes(branchId),
  };
}
