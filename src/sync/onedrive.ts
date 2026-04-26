import type { AppDataDocument } from "../persistence/schema";

interface OneDriveTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

interface PkceState {
  codeVerifier: string;
  state: string;
}

const tokenStorageKey = "sync-onedrive-token";
const pkceStorageKey = "sync-onedrive-pkce";
const scope = "offline_access Files.ReadWrite.AppFolder";
const documentPath = "shorinji-kempo-app-data.json";

export class OneDriveClient {
  private readonly clientId: string | null = import.meta.env.VITE_ONEDRIVE_CLIENT_ID ?? null;
  private readonly tenantId: string = (import.meta.env.VITE_ONEDRIVE_TENANT_ID ?? "common").trim() || "common";
  private readonly redirectUri: string = resolveRedirectUri(import.meta.env.VITE_ONEDRIVE_REDIRECT_URI);

  canUse(): boolean {
    return !!this.clientId;
  }

  getClientId(): string | null {
    return this.clientId;
  }

  async beginAuthorization(): Promise<void> {
    if (!this.clientId) {
      throw new Error("Missing VITE_ONEDRIVE_CLIENT_ID");
    }

    const codeVerifier = randomString(64);
    const state = randomString(32);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const pkceState: PkceState = { codeVerifier, state };
    localStorage.setItem(pkceStorageKey, JSON.stringify(pkceState));

    const authorizeUrl = new URL(`${this.authorityBaseUrl()}/oauth2/v2.0/authorize`);
    authorizeUrl.searchParams.set("client_id", this.clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", this.redirectUri);
    authorizeUrl.searchParams.set("response_mode", "query");
    authorizeUrl.searchParams.set("scope", scope);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    window.location.assign(authorizeUrl.toString());
  }

  async completeAuthorizationIfPresent(): Promise<boolean> {
    if (!this.clientId) {
      return false;
    }

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      cleanupAuthParams(url);
      throw new Error(`OneDrive authorization failed: ${error}`);
    }

    if (!code || !state) {
      return false;
    }

    const rawPkceState = localStorage.getItem(pkceStorageKey);
    if (!rawPkceState) {
      cleanupAuthParams(url);
      throw new Error("Missing PKCE state for OneDrive authorization.");
    }

    const pkceState = JSON.parse(rawPkceState) as PkceState;
    if (pkceState.state !== state) {
      cleanupAuthParams(url);
      throw new Error("Invalid OAuth state from OneDrive authorization.");
    }

    const tokenResponse = await fetch(`${this.authorityBaseUrl()}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri,
        code_verifier: pkceState.codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      cleanupAuthParams(url);
      throw new Error("Failed to exchange OneDrive authorization code.");
    }

    const payload = await tokenResponse.json();
    const expiresIn = Number(payload.expires_in ?? 3600);
    const tokens: OneDriveTokenSet = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: Date.now() + (expiresIn - 60) * 1000,
    };

    localStorage.setItem(tokenStorageKey, JSON.stringify(tokens));
    localStorage.removeItem(pkceStorageKey);
    cleanupAuthParams(url);
    return true;
  }

  isConnected(): boolean {
    const token = this.readToken();
    return !!token?.accessToken;
  }

  disconnect(): void {
    localStorage.removeItem(tokenStorageKey);
    localStorage.removeItem(pkceStorageKey);
  }

  async downloadDocument(): Promise<AppDataDocument | null> {
    const response = await this.fetchWithAuth(graphDocumentUrl(), { method: "GET" });
    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error("Failed to download OneDrive sync document.");
    }

    return await response.json() as AppDataDocument;
  }

  async uploadDocument(document: AppDataDocument): Promise<void> {
    const response = await this.fetchWithAuth(graphDocumentUrl(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(document),
    });

    if (!response.ok) {
      throw new Error("Failed to upload OneDrive sync document.");
    }
  }

  private readToken(): OneDriveTokenSet | null {
    const raw = localStorage.getItem(tokenStorageKey);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as OneDriveTokenSet;
    } catch {
      return null;
    }
  }

  private async ensureAccessToken(): Promise<string> {
    if (!this.clientId) {
      throw new Error("OneDrive is not configured.");
    }

    const tokenSet = this.readToken();
    if (!tokenSet) {
      throw new Error("Inte ansluten till OneDrive.");
    }

    if (tokenSet.expiresAt > Date.now()) {
      return tokenSet.accessToken;
    }

    if (!tokenSet.refreshToken) {
      throw new Error("OneDrive refresh token is missing.");
    }

    const refreshResponse = await fetch(`${this.authorityBaseUrl()}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        grant_type: "refresh_token",
        refresh_token: tokenSet.refreshToken,
        redirect_uri: this.redirectUri,
        scope,
      }),
    });

    if (!refreshResponse.ok) {
      this.disconnect();
      throw new Error("Failed to refresh OneDrive access token.");
    }

    const payload = await refreshResponse.json();
    const expiresIn = Number(payload.expires_in ?? 3600);
    const refreshed: OneDriveTokenSet = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? tokenSet.refreshToken,
      expiresAt: Date.now() + (expiresIn - 60) * 1000,
    };
    localStorage.setItem(tokenStorageKey, JSON.stringify(refreshed));
    return refreshed.accessToken;
  }

  private async fetchWithAuth(url: string, options: RequestInit): Promise<Response> {
    const accessToken = await this.ensureAccessToken();
    let response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status !== 401) {
      return response;
    }

    const refreshedToken = await this.ensureAccessToken();
    response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${refreshedToken}`,
      },
    });
    return response;
  }

  private authorityBaseUrl(): string {
    return `https://login.microsoftonline.com/${encodeURIComponent(this.tenantId)}`;
  }
}

function graphDocumentUrl(): string {
  return `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${documentPath}:/content`;
}

function cleanupAuthParams(url: URL): void {
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function resolveRedirectUri(explicitRedirectUri?: string): string {
  if (explicitRedirectUri && explicitRedirectUri.trim().length > 0) {
    return explicitRedirectUri.trim();
  }

  return `${window.location.origin}/`;
}

function randomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }

  return result;
}

async function sha256Base64Url(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let binary = "";

  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
