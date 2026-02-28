const BASE =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE
    ? import.meta.env.VITE_API_BASE.replace(/\/$/, "")
    : "/api";

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
