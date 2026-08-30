// The role vocabulary, as far as the frontend needs to know it.
//
// These decide what to *show*. Every one of them is enforced again on the
// server, which is the only place it counts: hiding a control the backend would
// refuse is a courtesy, and showing one it would allow is a bug in this file
// rather than a hole in the system.

export const ROLE_ADMIN = "admin";
export const ROLE_WSKO_ADMIN = "wsko_admin";
const FEDERATION_ADMIN_PREFIX = "federation_admin:";
const BRANCH_ADMIN_PREFIX = "branch_admin:";

export function federationAdmin(federationId: string): string {
  return FEDERATION_ADMIN_PREFIX + federationId;
}

export function branchAdmin(branchId: string): string {
  return BRANCH_ADMIN_PREFIX + branchId;
}

// A scoped role with nothing to scope it to is not a role, matching ScopeOf on
// the server — otherwise "branch_admin:" would read as authority over a branch
// whose id is the empty string.
function isScoped(role: string, prefix: string): boolean {
  return role.startsWith(prefix) && role.length > prefix.length;
}

export function isKnownRole(role: string): boolean {
  return role === ROLE_ADMIN || role === ROLE_WSKO_ADMIN
    || isScoped(role, FEDERATION_ADMIN_PREFIX) || isScoped(role, BRANCH_ADMIN_PREFIX);
}

// `admin` alone — not `wsko_admin` — is the technical superuser: root in the
// same sense a Unix root is, authority over the application itself, as
// distinct from coversEverything's authority over the organization it
// manages. Push broadcasts no longer need this (an audience is just another
// scope, and wsko_admin covers wsko like anyone else who covers it), but the
// next admin-only technical control will.
export function isTechnicalAdmin(roles: string[]): boolean {
  return roles.includes(ROLE_ADMIN);
}

export function coversEverything(roles: string[]): boolean {
  return roles.includes(ROLE_ADMIN) || roles.includes(ROLE_WSKO_ADMIN);
}

// Whether to offer the admin section at all. What is inside it is scoped
// further, per page and again on the server.
export function isAnyAdmin(roles: string[]): boolean {
  return roles.some(isKnownRole);
}

// The federations and branches this role set administers directly. Used to
// decide what a page opens on when there is exactly one of something — a branch
// admin should land in their own branch rather than on a list holding one item.
export function administeredFederations(roles: string[]): string[] {
  return roles.filter(r => isScoped(r, FEDERATION_ADMIN_PREFIX))
    .map(r => r.slice(FEDERATION_ADMIN_PREFIX.length));
}

export function administeredBranches(roles: string[]): string[] {
  return roles.filter(r => isScoped(r, BRANCH_ADMIN_PREFIX))
    .map(r => r.slice(BRANCH_ADMIN_PREFIX.length));
}
