import { cookies } from "next/headers";
import {
  DEFAULT_API_BASE_URL,
  authSessionResponseSchema,
  type AuthSessionResponse,
} from "@finance-ops/shared";
import { fetchApiJson } from "./server-api";
import { SESSION_COOKIE_NAME } from "./session-constants";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

export async function getServerAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function getServerAuthHeaders(): Promise<Record<string, string>> {
  const token = await getServerAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getServerSession(): Promise<AuthSessionResponse | null> {
  const headers = await getServerAuthHeaders();
  if (!headers.Authorization) {
    return null;
  }

  const result = await fetchApiJson<AuthSessionResponse | null>({
    url: `${apiBaseUrl}/auth/me`,
    init: {
      cache: "no-store",
      headers,
    },
    fallbackData: null,
    resourceLabel: "Current session",
    parse: (value) => authSessionResponseSchema.parse(value),
  });

  return result.ok ? result.data : null;
}
