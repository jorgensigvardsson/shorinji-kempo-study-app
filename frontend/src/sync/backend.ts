import type { AppDataDocument } from "../persistence/schema";
import { AuthExpiredError } from "./types";

// Base URLs are configurable for different environments.
// In development both services run on localhost via Docker Compose.
const authUrl = (import.meta.env.VITE_AUTH_URL as string | undefined) ?? "http://localhost:8081";
const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080";

const connectedKey = "sync-backend-connected";
const authExpiredKey = "sync-backend-auth-expired";

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

  // Verifies the current session by calling /auth/me.
  // Returns true if a valid session exists (covers both fresh login and returning users).
  // The caller (SyncManager) handles the ?auth_success=1 redirect detection separately.
  async completeAuthorizationIfPresent(): Promise<boolean> {
    try {
      const resp = await fetch(`${authUrl}/auth/me`, { credentials: "include" });
      if (resp.ok) {
        localStorage.setItem(connectedKey, "true");
        localStorage.removeItem(authExpiredKey);
        return true;
      }
    } catch {
      // Network error — treat as not connected.
    }
    localStorage.removeItem(connectedKey);
    return false;
  }

  isConnected(): boolean {
    return localStorage.getItem(connectedKey) === "true";
  }

  wasAuthExpired(): boolean {
    return localStorage.getItem(authExpiredKey) === "true";
  }

  disconnect(): void {
    // Fire-and-forget: clear the server-side cookie even if the page is navigating away.
    fetch(`${authUrl}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    localStorage.removeItem(connectedKey);
    localStorage.removeItem(authExpiredKey);
  }

  async downloadDocument(): Promise<AppDataDocument | null> {
    const resp = await fetch(`${apiUrl}/api/v1/document`, { credentials: "include" });
    if (resp.status === 404) return null;
    if (resp.status === 401) {
      localStorage.setItem(authExpiredKey, "true");
      localStorage.removeItem(connectedKey);
      throw new AuthExpiredError();
    }
    if (!resp.ok) throw new Error(`GET /api/v1/document: ${resp.status}`);
    return resp.json() as Promise<AppDataDocument>;
  }

  async uploadDocument(document: AppDataDocument): Promise<void> {
    const resp = await fetch(`${apiUrl}/api/v1/document`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(document),
    });
    if (resp.status === 401) {
      localStorage.setItem(authExpiredKey, "true");
      localStorage.removeItem(connectedKey);
      throw new AuthExpiredError();
    }
    if (!resp.ok) throw new Error(`PUT /api/v1/document: ${resp.status}`);
  }
}
