import type { AppDataDocument } from "../persistence/schema";
import { AuthExpiredError } from "./types";

interface GoogleTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

interface PkceState {
  codeVerifier: string;
  state: string;
}

interface GoogleFilesListResponse {
  files?: Array<{ id: string; name: string }>;
}

const tokenStorageKey = "sync-google-drive-token";
const pkceStorageKey = "sync-google-drive-pkce";
const scope = "https://www.googleapis.com/auth/drive.appdata";
const documentName = "shorinji-kempo-app-data.json";

export class GoogleDriveClient {
  private readonly clientId: string | null = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? null;
  private readonly redirectUri: string = resolveRedirectUri(import.meta.env.VITE_GOOGLE_REDIRECT_URI);

  canUse(): boolean {
    return !!this.clientId;
  }

  async beginAuthorization(): Promise<void> {
    if (!this.clientId) {
      throw new Error("Missing VITE_GOOGLE_CLIENT_ID");
    }

    const codeVerifier = randomString(64);
    const state = randomString(32);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    localStorage.setItem(pkceStorageKey, JSON.stringify({ codeVerifier, state } satisfies PkceState));

    const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizeUrl.searchParams.set("client_id", this.clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", this.redirectUri);
    authorizeUrl.searchParams.set("scope", scope);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("access_type", "offline");
    authorizeUrl.searchParams.set("prompt", "consent");
    authorizeUrl.searchParams.set("include_granted_scopes", "true");

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
      throw new Error(`Google Drive authorization failed: ${error}`);
    }

    if (!code || !state) {
      return false;
    }

    const rawPkceState = localStorage.getItem(pkceStorageKey);
    if (!rawPkceState) {
      return false;
    }

    const pkceState = JSON.parse(rawPkceState) as PkceState;
    if (pkceState.state !== state) {
      cleanupAuthParams(url);
      throw new Error("Invalid OAuth state from Google Drive authorization.");
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
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
      throw new Error("Failed to exchange Google Drive authorization code.");
    }

    const payload = await tokenResponse.json();
    const expiresIn = Number(payload.expires_in ?? 3600);
    const previous = this.readToken();
    const tokens: GoogleTokenSet = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? previous?.refreshToken,
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
    const fileId = await this.findDocumentId();
    if (!fileId) {
      return null;
    }

    const response = await this.fetchWithAuth(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      { method: "GET" }
    );

    if (!response.ok) {
      throw new Error("Failed to download Google Drive sync document.");
    }

    return await response.json() as AppDataDocument;
  }

  async uploadDocument(document: AppDataDocument): Promise<void> {
    const fileId = await this.findDocumentId();
    const metadata = fileId
      ? { name: documentName }
      : { name: documentName, parents: ["appDataFolder"] };

    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([JSON.stringify(document)], { type: "application/json" }));

    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=multipart`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

    const method = fileId ? "PATCH" : "POST";
    const response = await this.fetchWithAuth(url, {
      method,
      body: form,
    });

    if (!response.ok) {
      throw new Error("Failed to upload Google Drive sync document.");
    }
  }

  private async findDocumentId(): Promise<string | null> {
    const query = encodeURIComponent(`name='${documentName}' and 'appDataFolder' in parents and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name)&pageSize=1`;
    const response = await this.fetchWithAuth(url, { method: "GET" });
    if (!response.ok) {
      throw new Error("Failed to query Google Drive app data files.");
    }

    const payload = await response.json() as GoogleFilesListResponse;
    return payload.files?.[0]?.id ?? null;
  }

  private readToken(): GoogleTokenSet | null {
    const raw = localStorage.getItem(tokenStorageKey);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as GoogleTokenSet;
    } catch {
      return null;
    }
  }

  private async ensureAccessToken(): Promise<string> {
    if (!this.clientId) {
      throw new Error("Google Drive is not configured.");
    }

    const tokenSet = this.readToken();
    if (!tokenSet) {
      throw new Error("Inte ansluten till Google Drive.");
    }

    if (tokenSet.expiresAt > Date.now()) {
      return tokenSet.accessToken;
    }

    if (!tokenSet.refreshToken) {
      throw new Error("Google Drive refresh token is missing.");
    }

    const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        grant_type: "refresh_token",
        refresh_token: tokenSet.refreshToken,
      }),
    });

    if (!refreshResponse.ok) {
      this.disconnect();
      throw new AuthExpiredError();
    }

    const payload = await refreshResponse.json();
    const expiresIn = Number(payload.expires_in ?? 3600);
    const refreshed: GoogleTokenSet = {
      accessToken: payload.access_token,
      refreshToken: tokenSet.refreshToken,
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
}

function cleanupAuthParams(url: URL): void {
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  url.searchParams.delete("error");
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
