import { DEFAULT_API_BASE_URL } from "@finance-ops/shared";
import { SESSION_COOKIE_NAME } from "./session-constants";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

export function getClientAccessToken(): string | null {
  return readCookie(SESSION_COOKIE_NAME);
}

export function getClientAuthHeaders(): Record<string, string> {
  const token = getClientAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function setClientAccessToken(token: string) {
  document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 12}; SameSite=Lax`;
}

export function clearClientAccessToken() {
  document.cookie = `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function getApiBaseUrl() {
  return apiBaseUrl;
}
