import { APP_SCHEMA_COMPAT_VERSION, APP_SCHEMA_VERSION, type AppDataDocument } from "../persistence/schema";
import { AuthExpiredError, ClientOutdatedError, DocumentChangedError, DocumentTooLargeError } from "./types";

// Mirrors the MaxBytesReader cap in backend/persistence/internal/api/handlers.go,
// which is itself set below the 2 MB Cosmos hard-limits an item to. Only used to
// describe the failure — the server is the one that enforces it.
const DOCUMENT_LIMIT_BYTES = 1 << 20;

// A 409 on a document write means the stored schema is newer than this build. Any
// other 409, or a body we cannot read, is left to the generic error path.
async function readRequiredSchemaVersion(resp: Response): Promise<number | null> {
  try {
    const body = await resp.json() as { error?: string; requiredSchemaVersion?: number };
    if (body.error !== "schema_too_old") return null;
    return typeof body.requiredSchemaVersion === "number" ? body.requiredSchemaVersion : APP_SCHEMA_VERSION + 1;
  } catch {
    return null;
  }
}

// A document as read from the server, paired with the ETag identifying that exact
// stored version. A null etag means the server sent none — an older API build.
export interface RemoteDocument {
  document: AppDataDocument;
  etag: string | null;
}

// Base URLs are configurable for different environments.
// In development both services run on localhost via Docker Compose.
const authUrl = (import.meta.env.VITE_AUTH_URL as string | undefined) ?? "http://localhost:8081";
const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080";
// Build identifier (the deployed commit SHA) baked in by CI; used only to give
// feedback submissions context. Falls back to "dev" for local builds.
const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "dev";

const connectedKey = "sync-backend-connected";
const authExpiredKey = "sync-backend-auth-expired";
const userInfoKey = "sync-backend-user";

export interface BackendUserInfo {
  email: string;
  displayName: string;
  providers: string[];
  roles: string[];
  // The branch this practitioner belongs to, and the federation it sits in.
  // Both are empty for a member of a WSKO-attached branch (which has no
  // federation) and for an account admitted before branches existed.
  branchId: string;
  federation: string;
}

// A linked provider identity as returned by the admin user listing.
export interface AdminLinkedIdentity {
  sub: string;
  email: string;
}

// A user record as returned by GET /auth/admin/users (admin only).
export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  branchId?: string; // absent for a user admitted before the branch model existed
  linkedIdentities: Record<string, AdminLinkedIdentity>;
  roles: string[];
  oidc: boolean; // true when any linked identity is an OIDC provider (display name not editable)
  createdAt: string;
  lastLoginAt: string;
}

// A branch as the registration picker sees it, from the unauthenticated
// GET /auth/org/branches. Branches with no federation belong to WSKO; the label
// for that group is the frontend's to supply, since WSKO is not a stored
// organization with a name of its own.
export interface PublicBranch {
  id: string;
  name: string;
  federationId?: string;
  federationName?: string;
}

// What GET /auth/join/context knows about somebody who has proved an address and
// has no account. `pending` is present when they have already applied, so a
// returning applicant lands on their request rather than on an empty form.
export interface JoinContext {
  email: string;
  name: string;
  provider: string;
  pending?: { branchId: string; branchName: string; createdAt: string };
}

// The organization as GET /auth/admin/org returns it, scoped to what the caller
// administers. Branches belonging to no federation come back separately because
// WSKO is the root rather than a record with a name of its own.
export interface AdminOrgBranch {
  id: string;
  name: string;
}

export interface AdminOrgFederation {
  id: string;
  name: string;
  branches: AdminOrgBranch[];
}

export interface AdminOrgTree {
  federations: AdminOrgFederation[];
  wskoBranches: AdminOrgBranch[];
}

// A pending join request, as the admins who may decide it see it.
export interface AdminJoinRequest {
  email: string;
  name: string;
  note?: string;
  branchId: string;
  branchName: string;
  createdAt: string;
  previouslyDeniedAt?: string;
}

// Result of POST /auth/email/start. "oidc" means the domain has an OIDC provider
// and the caller should redirect there; "existing"/"new" mean a code was emailed
// (only "new" needs a name collected on verify).
//
// expiresInSeconds is the server's own TTL for the code it just sent, so the UI
// can state it without keeping a second copy of the number. It is null when the
// server didn't say — an older backend than this client — and the UI then simply
// leaves the validity out rather than guessing at it.
export type EmailStartResult =
  | { action: "oidc"; provider: string }
  | { action: "existing"; expiresInSeconds: number | null }
  | { action: "new"; expiresInSeconds: number | null };

// Thrown when the global code-sending rate limit (1 per 5 s) rejects a request.
// Carries the status of a refused admin write, so a page can say "you may not"
// rather than "something went wrong" when the server has been specific.
export class AdminRequestError extends Error {
  constructor(readonly status: number) {
    super(`admin request failed: ${status}`);
    this.name = "AdminRequestError";
  }
}

export class RateLimitError extends Error {
  constructor() {
    super("rate limited");
    this.name = "RateLimitError";
  }
}

export class BackendSyncClient {
  private pendingEmail: string | null = null;

  // Called by the sign-in UI before beginAuthorization().
  setEmail(email: string): void {
    this.pendingEmail = email;
  }

  canUse(): boolean {
    return true;
  }

  async beginAuthorization(): Promise<void> {
    if (!this.pendingEmail) {
      throw new Error("BackendSyncClient: call setEmail() before beginAuthorization()");
    }
    window.location.href = `${authUrl}/auth/login?email=${encodeURIComponent(this.pendingEmail)}`;
  }

  // Begins email (code) login: asks the backend to send a verification code (or
  // tells us to redirect to OIDC). language is the browser's detected language.
  async startEmailAuth(email: string, language: string): Promise<EmailStartResult> {
    const resp = await fetch(`${authUrl}/auth/email/start`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, language }),
    });
    if (resp.status === 429) throw new RateLimitError();
    if (!resp.ok) throw new Error(`POST /auth/email/start: ${resp.status}`);
    const body = await resp.json() as { action: string; provider?: string; expires_in_seconds?: number };
    if (body.action === "oidc") return { action: "oidc", provider: body.provider ?? "" };
    return {
      action: body.action === "new" ? "new" : "existing",
      expiresInSeconds: typeof body.expires_in_seconds === "number" ? body.expires_in_seconds : null,
    };
  }

  // Submits a verification code (and, for a new address, a name). On success the
  // server sets the auth cookies; the caller then switches the provider to backend.
  // Returns the server's error code (e.g. "invalid_code", "too_many_attempts") on
  // a rejected code.
  //
  // A valid code for an address with no account is not a login: the server sets a
  // join ticket instead of a session and answers {action: "join_required"}. That
  // comes back as "join_required" so the caller cannot mistake it for a success
  // and try to start a session that was never issued.
  async verifyEmailCode(email: string, code: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const resp = await fetch(`${authUrl}/auth/email/verify`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, name }),
    });
    if (resp.ok) {
      const body = await resp.json().catch(() => ({})) as { action?: string };
      if (body.action === "join_required") return { ok: false, error: "join_required" };
      return { ok: true };
    }
    if (resp.status === 400) {
      const body = await resp.json().catch(() => ({})) as { error?: string };
      return { ok: false, error: body.error ?? "invalid_code" };
    }
    throw new Error(`POST /auth/email/verify: ${resp.status}`);
  }

  // ── Admin: the organization and its waiting list ─────────────────────────

  async adminOrgTree(): Promise<AdminOrgTree> {
    const resp = await this.fetchWithRefresh(`${authUrl}/auth/admin/org`);
    if (!resp.ok) throw new Error(`GET /auth/admin/org: ${resp.status}`);
    return await resp.json() as AdminOrgTree;
  }

  async adminCreateFederation(id: string, name: string): Promise<void> {
    await this.adminWrite("POST", `${authUrl}/auth/admin/federations`, { id, name });
  }

  async adminRenameFederation(id: string, name: string): Promise<void> {
    await this.adminWrite("PATCH", `${authUrl}/auth/admin/federations/${encodeURIComponent(id)}`, { name });
  }

  // An omitted federationId means the branch hangs directly from WSKO, which
  // only a WSKO admin may do — the server refuses rather than reinterpreting.
  async adminCreateBranch(name: string, federationId?: string): Promise<void> {
    await this.adminWrite("POST", `${authUrl}/auth/admin/branches`,
      federationId ? { name, federationId } : { name });
  }

  // Both fields are optional and distinct: omitting federationId leaves the
  // branch where it is, while passing "" moves it to WSKO.
  async adminUpdateBranch(id: string, changes: { name?: string; federationId?: string }): Promise<void> {
    await this.adminWrite("PATCH", `${authUrl}/auth/admin/branches/${encodeURIComponent(id)}`, changes);
  }

  async adminListRequests(): Promise<AdminJoinRequest[]> {
    const resp = await this.fetchWithRefresh(`${authUrl}/auth/admin/requests`);
    if (!resp.ok) throw new Error(`GET /auth/admin/requests: ${resp.status}`);
    return await resp.json() as AdminJoinRequest[];
  }

  async adminDecideRequest(email: string, approve: boolean): Promise<void> {
    const action = approve ? "approve" : "deny";
    await this.adminWrite("POST", `${authUrl}/auth/admin/requests/${encodeURIComponent(email)}/${action}`);
  }

  // Shared plumbing for the admin writes above. A refusal carries the server's
  // status so a caller can tell "you may not" from "that did not work".
  private async adminWrite(method: string, url: string, body?: unknown): Promise<void> {
    const resp = await this.fetchWithRefresh(url, {
      method,
      ...(body === undefined ? {} : {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
    if (!resp.ok) throw new AdminRequestError(resp.status);
  }

  // ── Admission: joining a branch ──────────────────────────────────────────
  // These are authorized by the join-ticket cookie rather than by a session,
  // since their whole audience is people who have no account yet. The cookie is
  // httpOnly, so credentials: "include" is the only way it travels.

  async listBranches(): Promise<PublicBranch[]> {
    const resp = await fetch(`${authUrl}/auth/org/branches`);
    if (!resp.ok) throw new Error(`GET /auth/org/branches: ${resp.status}`);
    return await resp.json() as PublicBranch[];
  }

  // Returns null when there is no ticket — expired, or never issued — which is
  // not an error but a reason to send the visitor back to verify their address.
  async getJoinContext(): Promise<JoinContext | null> {
    const resp = await fetch(`${authUrl}/auth/join/context`, { credentials: "include" });
    if (resp.status === 401) return null;
    if (!resp.ok) throw new Error(`GET /auth/join/context: ${resp.status}`);
    return await resp.json() as JoinContext;
  }

  // "pending" means they have already applied and are waiting; "account_exists"
  // means the address can simply sign in. Neither is a failure worth a stack
  // trace, so both come back as a reason rather than an exception.
  async submitJoinRequest(branchId: string, name: string, note: string, language: string):
      Promise<{ ok: true } | { ok: false; reason: string }> {
    const resp = await fetch(`${authUrl}/auth/join/request`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId, name, note, language }),
    });
    if (resp.ok) return { ok: true };
    if (resp.status === 409) {
      const body = await resp.json().catch(() => ({})) as { reason?: string };
      return { ok: false, reason: body.reason ?? "pending" };
    }
    if (resp.status === 429) throw new RateLimitError();
    if (resp.status === 401) return { ok: false, reason: "no_ticket" };
    return { ok: false, reason: "failed" };
  }

  async withdrawJoinRequest(): Promise<void> {
    const resp = await fetch(`${authUrl}/auth/join/withdraw`, {
      method: "POST",
      credentials: "include",
    });
    if (!resp.ok && resp.status !== 404) {
      throw new Error(`POST /auth/join/withdraw: ${resp.status}`);
    }
  }

  // In-flight refresh shared by all callers in this tab (single-flight).
  private refreshInFlight: Promise<boolean> | null = null;

  // Attempts a silent token refresh via the refresh_token cookie.
  // Returns true if the server issued a new access token.
  //
  // Refresh tokens are single-use and rotated on every call, so two refreshes
  // racing on the same token make the loser look like a replayed (stolen) token
  // to the server, which then revokes the whole session. We prevent that on two
  // levels: a per-tab in-flight promise coalesces concurrent callers here, and
  // the Web Locks API serializes across *other* tabs of the same origin. Because
  // the browser attaches the current cookie at fetch time, a queued caller always
  // sends the freshly-rotated token rather than a stale one.
  private async tryRefresh(): Promise<boolean> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.runRefresh().finally(() => { this.refreshInFlight = null; });
    return this.refreshInFlight;
  }

  private async runRefresh(): Promise<boolean> {
    const doFetch = async (): Promise<boolean> => {
      try {
        const resp = await fetch(`${authUrl}/auth/refresh`, { method: "POST", credentials: "include" });
        return resp.ok;
      } catch {
        return false;
      }
    };
    // Web Locks serialize across all same-origin tabs; fall back to a plain call
    // where the API is unavailable (e.g. older Safari).
    if (typeof navigator !== "undefined" && navigator.locks) {
      return navigator.locks.request("sk-auth-refresh", doFetch);
    }
    return doFetch();
  }

  // Fetches with automatic silent refresh on 401. On refresh failure marks auth as expired.
  private async fetchWithRefresh(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let resp = await fetch(input, { credentials: "include", ...init });
    if (resp.status === 401) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        resp = await fetch(input, { credentials: "include", ...init });
      }
    }
    if (resp.status === 401) {
      localStorage.setItem(authExpiredKey, "true");
      localStorage.removeItem(connectedKey);
      throw new AuthExpiredError();
    }
    return resp;
  }

  // Verifies the current session by calling /auth/me.
  // Returns true if a valid session exists (covers both fresh login and returning users).
  // The caller (SyncManager) handles the ?auth_success=1 redirect detection separately.
  async completeAuthorizationIfPresent(): Promise<boolean> {
    try {
      let resp = await fetch(`${authUrl}/auth/me`, { credentials: "include" });
      if (resp.status === 401) {
        // Access token expired — attempt silent refresh before giving up.
        const refreshed = await this.tryRefresh();
        if (refreshed) {
          resp = await fetch(`${authUrl}/auth/me`, { credentials: "include" });
        }
      }
      if (resp.ok) {
        const user = await resp.json() as { email: string; displayName: string; linkedIdentities: Record<string, unknown>; roles?: string[]; branchId?: string; federation?: string };
        localStorage.setItem(connectedKey, "true");
        localStorage.setItem(userInfoKey, JSON.stringify({
          email: user.email,
          displayName: user.displayName,
          providers: Object.keys(user.linkedIdentities ?? {}),
          roles: user.roles ?? [],
          branchId: user.branchId ?? "",
          federation: user.federation ?? "",
        } satisfies BackendUserInfo));
        localStorage.removeItem(authExpiredKey);
        return true;
      }
      if (resp.status === 401) {
        localStorage.setItem(authExpiredKey, "true");
      }
    } catch {
      // Network error — treat as not connected.
    }
    localStorage.removeItem(connectedKey);
    return false;
  }

  getUserInfo(): BackendUserInfo | null {
    const raw = localStorage.getItem(userInfoKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<BackendUserInfo>;
      // Default every field, so info cached by a build that predates any of them
      // stays safe to read rather than yielding undefined at the call site.
      return {
        email: parsed.email ?? "",
        displayName: parsed.displayName ?? "",
        providers: parsed.providers ?? [],
        roles: parsed.roles ?? [],
        branchId: parsed.branchId ?? "",
        federation: parsed.federation ?? "",
      };
    } catch { return null; }
  }

  isConnected(): boolean {
    // Guard against the race where the cookie expires mid-session but localStorage
    // still holds the connected flag. completeAuthorizationIfPresent() clears both
    // keys on 401, but wasAuthExpired() being true means we already know auth lapsed.
    return localStorage.getItem(connectedKey) === "true"
      && localStorage.getItem(authExpiredKey) !== "true";
  }

  wasAuthExpired(): boolean {
    return localStorage.getItem(authExpiredKey) === "true";
  }

  disconnect(): void {
    // Fire-and-forget: clear the server-side cookie even if the page is navigating away.
    fetch(`${authUrl}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    localStorage.removeItem(connectedKey);
    localStorage.removeItem(authExpiredKey);
    localStorage.removeItem(userInfoKey);
  }

  async downloadDocument(): Promise<RemoteDocument | null> {
    let resp = await fetch(`${apiUrl}/api/v1/document`, { credentials: "include" });
    if (resp.status === 404) return null;
    if (resp.status === 401) {
      const refreshed = await this.tryRefresh();
      if (refreshed) resp = await fetch(`${apiUrl}/api/v1/document`, { credentials: "include" });
    }
    if (resp.status === 401) {
      localStorage.setItem(authExpiredKey, "true");
      localStorage.removeItem(connectedKey);
      throw new AuthExpiredError();
    }
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(`GET /api/v1/document: ${resp.status}`);
    // The ETag names the exact version being read. Sending it back as If-Match on
    // the upload is what stops this device overwriting a write it never saw. It is
    // only readable cross-origin because the API exposes it (see shared/cors).
    return { document: await (resp.json() as Promise<AppDataDocument>), etag: resp.headers.get("ETag") };
  }

  // etag is the version this upload is based on: the one downloadDocument returned,
  // or null when the caller believes no document exists on the server yet. Either
  // way the server verifies the belief and answers 412 if it no longer holds.
  async uploadDocument(document: AppDataDocument, etag: string | null): Promise<string | null> {
    const body = JSON.stringify(document);
    const init: RequestInit = {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        // Which shape this document is written in, recorded against it.
        "X-App-Schema-Version": String(APP_SCHEMA_VERSION),
        // The highest shape this build can hold without dropping anything. This is
        // what the server checks the stored document against — a build that writes an
        // older shape but preserves what it does not recognise is still safe to let
        // through, and this is what tells the two apart.
        "X-App-Schema-Compat": String(APP_SCHEMA_COMPAT_VERSION),
        ...(etag ? { "If-Match": etag } : { "If-None-Match": "*" }),
      },
      body,
    };
    const resp = await this.fetchWithRefresh(`${apiUrl}/api/v1/document`, init);
    if (resp.status === 412) throw new DocumentChangedError();
    if (resp.status === 409) {
      const required = await readRequiredSchemaVersion(resp);
      if (required !== null) throw new ClientOutdatedError(required);
    }
    // The document has outgrown the server's limit. Measured here rather than taken
    // from the response so the error can say how far over it is — the server only
    // says no.
    if (resp.status === 413) throw new DocumentTooLargeError(new Blob([body]).size, DOCUMENT_LIMIT_BYTES);
    if (!resp.ok) throw new Error(`PUT /api/v1/document: ${resp.status}`);
    return resp.headers.get("ETag");
  }

  // Initiates an OIDC flow to link another provider identity to the current account.
  // The browser navigates away; control returns via ?link_success=1 or ?link_error=X.
  // Uses a form POST so that SameSite=Lax cookies are not sent on cross-site GET navigations.
  beginLinkAuthorization(email: string): void {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${authUrl}/auth/link?email=${encodeURIComponent(email)}`;
    document.body.appendChild(form);
    form.submit();
  }

  // Removes a provider identity from the current account.
  // Refreshes stored user info from /auth/me on success.
  async unlinkProvider(provider: string): Promise<void> {
    const resp = await this.fetchWithRefresh(`${authUrl}/auth/link/${encodeURIComponent(provider)}`, { method: "DELETE" });
    if (resp.status === 409) throw new Error("last-provider");
    if (!resp.ok) throw new Error(`DELETE /auth/link/${provider}: ${resp.status}`);
    // Refresh stored user info so the UI reflects the change immediately.
    await this.completeAuthorizationIfPresent();
  }

  // ── Admin: user management (requires the "admin" role; enforced by the backend) ──

  // Lists every user in the system.
  async adminListUsers(): Promise<AdminUser[]> {
    const resp = await this.fetchWithRefresh(`${authUrl}/auth/admin/users`);
    if (!resp.ok) throw new Error(`GET /auth/admin/users: ${resp.status}`);
    return resp.json() as Promise<AdminUser[]>;
  }

  // Updates a user's display name (only permitted for non-OIDC users; the backend
  // returns 409 otherwise).
  async adminUpdateDisplayName(id: string, displayName: string): Promise<void> {
    const resp = await this.fetchWithRefresh(`${authUrl}/auth/admin/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
    if (!resp.ok) throw new Error(`PATCH /auth/admin/users/${id}: ${resp.status}`);
  }

  // Replaces a user's roles with the given set. The backend checks only the
  // roles that actually change, and only against what the caller already covers:
  // 403 for a grant beyond their authority, 409 when an admin would strip their
  // own global role.
  async adminSetRoles(id: string, roles: string[]): Promise<void> {
    const resp = await this.fetchWithRefresh(`${authUrl}/auth/admin/users/${encodeURIComponent(id)}/roles`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles }),
    });
    if (resp.status === 409) throw new Error("self-demotion");
    if (!resp.ok) throw new Error(`PUT /auth/admin/users/${id}/roles: ${resp.status}`);
  }

  // Force-logs-out a user by revoking all their refresh tokens. Their access token
  // remains valid until it expires (≤ 1 h), after which they can no longer refresh.
  async adminLogoutUser(id: string): Promise<void> {
    const resp = await this.fetchWithRefresh(`${authUrl}/auth/admin/users/${encodeURIComponent(id)}/logout`, {
      method: "POST",
    });
    if (!resp.ok) throw new Error(`POST /auth/admin/users/${id}/logout: ${resp.status}`);
  }

  // ── Session management ──

  // Logs the current user out on every *other* device by revoking all their refresh
  // tokens except the current session's. Those devices keep their access token until
  // it expires (≤ 1 h). Throws "session-unidentified" if the current access token
  // predates the session-tracking claim (the caller should retry after a short wait).
  async logoutOtherDevices(): Promise<void> {
    const resp = await this.fetchWithRefresh(`${authUrl}/auth/sessions/logout-others`, {
      method: "POST",
    });
    if (resp.status === 409) throw new Error("session-unidentified");
    if (!resp.ok) throw new Error(`POST /auth/sessions/logout-others: ${resp.status}`);
  }

  // Fetches the user record and app document, bundles them as a JSON download.
  async exportAccount(): Promise<void> {
    const [meResp, docResp] = await Promise.all([
      fetch(`${authUrl}/auth/me`, { credentials: "include" }),
      fetch(`${apiUrl}/api/v1/document`, { credentials: "include" }),
    ]);
    if (!meResp.ok) throw new Error(`GET /auth/me: ${meResp.status}`);
    const userRecord = await meResp.json();
    const appData = docResp.ok ? await docResp.json() : null;

    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), userRecord, appData }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shorinji-kempo-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Submits in-app feedback. The backend attributes it to the signed-in user
  // and emails it to the configured recipients, along with context (app
  // version, language, and — read server-side from the request — user agent)
  // to help with triage.
  async submitFeedback(message: string, language: string): Promise<void> {
    const resp = await this.fetchWithRefresh(`${authUrl}/auth/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, language, appVersion }),
    });
    if (resp.status === 429) throw new RateLimitError();
    if (!resp.ok) throw new Error(`POST /auth/feedback: ${resp.status}`);
  }

  // Deletes app data then user record in order, then clears local state.
  async deleteAccount(): Promise<void> {
    const docResp = await fetch(`${apiUrl}/api/v1/account`, { method: "DELETE", credentials: "include" });
    if (!docResp.ok && docResp.status !== 404) throw new Error(`DELETE /api/v1/account: ${docResp.status}`);

    const authResp = await fetch(`${authUrl}/auth/account`, { method: "DELETE", credentials: "include" });
    if (!authResp.ok) throw new Error(`DELETE /auth/account: ${authResp.status}`);

    localStorage.removeItem(connectedKey);
    localStorage.removeItem(authExpiredKey);
    localStorage.removeItem(userInfoKey);
  }
}
