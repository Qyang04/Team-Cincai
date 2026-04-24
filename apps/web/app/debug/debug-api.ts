import { DEFAULT_API_BASE_URL } from "@finance-ops/shared";
import { getApiBaseUrl, getClientAuthHeaders } from "../lib/client-session";

type DebugDocumentResponse = {
  texts: string[];
  joinedText: string;
};

async function readDebugErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) {
      return body.message.join("; ");
    }
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  } catch {
    // ignore body parse failures
  }

  return fallback;
}

export async function postDebugFiles(path: "ocr" | "pdf-text", files: readonly File[]): Promise<DebugDocumentResponse> {
  const apiBaseUrl = getApiBaseUrl() ?? DEFAULT_API_BASE_URL;
  const body = new FormData();

  for (const file of files) {
    body.append("files", file);
  }

  const response = await fetch(`${apiBaseUrl}/debug/documents/${path}`, {
    method: "POST",
    headers: {
      ...getClientAuthHeaders(),
    },
    body,
  });

  if (!response.ok) {
    throw new Error(
      await readDebugErrorMessage(
        response,
        `Debug extraction request failed with ${response.status} ${response.statusText}.`,
      ),
    );
  }

  return (await response.json()) as DebugDocumentResponse;
}
