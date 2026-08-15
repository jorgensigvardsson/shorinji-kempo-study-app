import { APP_SCHEMA_COMPAT_VERSION, APP_SCHEMA_VERSION, type AppDataDocument } from "../persistence/schema";
import { AuthExpiredError, ClientOutdatedError, DocumentChangedError } from "./types";

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
  linkedIdentities: Record<string, AdminLinkedIdentity>;
  roles: string[];
  oidc: boolean; // true when any linked identity is an OIDC provider (display name not editable)
  createdAt: string;
  lastLoginAt: string;
}

// Result of POST /auth/email/start. "oidc" means the domain has an OIDC provider
// and the caller should redirect there; "existing"/"new" mean a code was emailed
// (only "new" needs a name collected on verify).
export type EmailStartResult =
  | { action: "oidc"; provider: string }
  | { action: "existing" }
  | { action: "new" };

// Thrown when the global code-sending rate limit (1 per 5 s) rejects a request.
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
    return resp.json() as Promise<EmailStartResult>;
  }

  // Submits a verification code (and, for new users, a name). On success the
  // server sets the auth cookies; the caller then switches the provider to backend.
  // Returns the server's error code (e.g. "invalid_code", "too_many_attempts") on
  // a rejected code.
  async verifyEmailCode(email: string, code: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const resp = await fetch(`${authUrl}/auth/email/verify`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, name }),
    });
    if (resp.ok) return { ok: true };
    if (resp.status === 400) {
      const body = await resp.json().catch(() => ({})) as { error?: string };
      return { ok: false, error: body.error ?? "invalid_code" };
    }
    throw new Error(`POST /auth/email/verify: ${resp.status}`);
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
        const user = await resp.json() as { email: string; displayName: string; linkedIdentities: Record<string, unknown>; roles?: string[] };
        localStorage.setItem(connectedKey, "true");
        localStorage.setItem(userInfoKey, JSON.stringify({
          email: user.email,
          displayName: user.displayName,
          providers: Object.keys(user.linkedIdentities ?? {}),
          roles: user.roles ?? [],
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
      // Default arrays so values cached before roles existed stay safe to read.
      return {
        email: parsed.email ?? "",
        displayName: parsed.displayName ?? "",
        providers: parsed.providers ?? [],
        roles: parsed.roles ?? [],
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
      body: JSON.stringify(document),
    };
    const resp = await this.fetchWithRefresh(`${apiUrl}/api/v1/document`, init);
    if (resp.status === 412) throw new DocumentChangedError();
    if (resp.status === 409) {
      const required = await readRequiredSchemaVersion(resp);
      if (required !== null) throw new ClientOutdatedError(required);
    }
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

  // Promotes (admin=true) or demotes (admin=false) a user. The backend rejects
  // an admin demoting themselves with 409.
  async adminSetAdmin(id: string, admin: boolean): Promise<void> {
    const resp = await this.fetchWithRefresh(`${authUrl}/auth/admin/users/${encodeURIComponent(id)}/roles`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin }),
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
