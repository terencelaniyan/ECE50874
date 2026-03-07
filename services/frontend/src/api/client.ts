const BASE =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE
    ? import.meta.env.VITE_API_BASE.replace(/\/$/, "")
    : "/api";

/**
 * Base URL for API requests.
 * 
 * Defaults to "/api" unless VITE_API_BASE is set in the environment.
 */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${BASE}${p}`;
}

function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (e instanceof Error && /fetch|network|failed to load/i.test(e.message)) return true;
  return false;
}

const NETWORK_ERROR_MESSAGE =
  import.meta.env?.DEV && !import.meta.env?.VITE_API_BASE
    ? "Cannot reach the API. Start the backend (e.g. in services/backend: uvicorn app.main:app --reload --port 8000)."
    : "Network error. Check your connection.";

/**
 * Perform a GET request to the specified API path.
 * 
 * @template T - The expected response type.
 * @param path - The API endpoint path.
 * @param options - Optional configuration like AbortSignal.
 * @returns A promise that resolves to the parsed JSON response.
 * @throws {ApiError} - If the response is not OK or a network error occurs.
 */
export async function get<T>(path: string, options?: { signal?: AbortSignal }): Promise<T> {
  try {
    const res = await fetch(apiUrl(path), { signal: options?.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new ApiError(res.status, text || res.statusText);
    }
    return res.json() as Promise<T>;
  } catch (e) {
    if (isNetworkError(e)) throw new ApiError(0, NETWORK_ERROR_MESSAGE);
    throw e;
  }
}

/**
 * Perform a POST request with a JSON body.
 * 
 * @template T - The expected response type.
 * @param path - The API endpoint path.
 * @param body - The object to be stringified as the request body.
 * @returns A promise that resolves to the parsed JSON response (or undefined for 204).
 * @throws {ApiError} - If the response is not OK.
 */
export async function post<T>(path: string, body: unknown): Promise<T> {
  try {
    const res = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ApiError(res.status, text || res.statusText);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  } catch (e) {
    if (isNetworkError(e)) throw new ApiError(0, NETWORK_ERROR_MESSAGE);
    throw e;
  }
}

export async function patch<T>(path: string, body: unknown): Promise<T> {
  try {
    const res = await fetch(apiUrl(path), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ApiError(res.status, text || res.statusText);
    }
    return res.json() as Promise<T>;
  } catch (e) {
    if (isNetworkError(e)) throw new ApiError(0, NETWORK_ERROR_MESSAGE);
    throw e;
  }
}

export async function del(path: string): Promise<void> {
  try {
    const res = await fetch(apiUrl(path), { method: "DELETE" });
    if (!res.ok) {
      const text = await res.text();
      throw new ApiError(res.status, text || res.statusText);
    }
  } catch (e) {
    if (isNetworkError(e)) throw new ApiError(0, NETWORK_ERROR_MESSAGE);
    throw e;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}
