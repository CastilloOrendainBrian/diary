/** Error returned by the API, carrying the stable error code for translation. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Sends a JSON request with the session cookie. Resolves with the parsed body, or undefined
 * for 204 responses. Rejects with ApiError for HTTP errors and network failures.
 */
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin" };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, "NETWORK", "Network error");
  }

  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN",
      error?.message ?? response.statusText,
    );
  }
  return data as T;
}

/**
 * Downloads a file from the API (for example the diary export). The file name comes from the
 * Content-Disposition header that the server sets.
 */
export async function downloadFile(path: string): Promise<{ blob: Blob; fileName: string }> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "NETWORK", "Network error");
  }

  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN",
      error?.message ?? response.statusText,
    );
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  return { blob: await response.blob(), fileName: match?.[1] ?? "diario.txt" };
}
