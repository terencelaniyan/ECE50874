import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiUrl, get, post, patch, del, ApiError } from "./client";

describe("apiUrl", () => {
  it("uses default /api base when VITE_API_BASE is not set", () => {
    expect(apiUrl("/balls")).toBe("/api/balls");
    expect(apiUrl("balls")).toBe("/api/balls");
  });

  it("normalizes path to start with slash", () => {
    expect(apiUrl("balls")).toBe("/api/balls");
  });
});

describe("get", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("calls fetch with correct URL and returns JSON", async () => {
    const mockJson = { items: [] };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockJson),
    });
    const result = await get<typeof mockJson>("/balls");
    expect(fetch).toHaveBeenCalledWith("/api/balls");
    expect(result).toEqual(mockJson);
  });

  it("throws ApiError with status and message when not ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: () => Promise.resolve("Not found"),
    });
    let thrown: ApiError | null = null;
    try {
      await get("/balls");
    } catch (e) {
      thrown = e as ApiError;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown?.status).toBe(404);
    expect(thrown?.message).toBe("Not found");
  });
});

describe("post", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("calls fetch with method POST, JSON body and Content-Type", async () => {
    const body = { name: "x" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "1" }),
    });
    await post("/arsenals", body);
    expect(fetch).toHaveBeenCalledWith("/api/arsenals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  it("returns undefined for 204 No Content", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 204,
    });
    const result = await post<undefined>("/something", {});
    expect(result).toBeUndefined();
  });

  it("throws ApiError when not ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: () => Promise.resolve("Invalid body"),
    });
    const e = await post("/x", {}).catch((err) => err);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(400);
    expect((e as ApiError).message).toBe("Invalid body");
  });
});

describe("patch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("calls fetch with method PATCH and JSON body", async () => {
    const body = { name: "y" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "1", name: "y" }),
    });
    await patch("/arsenals/1", body);
    expect(fetch).toHaveBeenCalledWith("/api/arsenals/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  it("throws ApiError when not ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Server error"),
      statusText: "Internal Server Error",
    });
    await expect(patch("/x", {})).rejects.toThrow(ApiError);
  });
});

describe("del", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("calls fetch with method DELETE", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    await del("/arsenals/1");
    expect(fetch).toHaveBeenCalledWith("/api/arsenals/1", { method: "DELETE" });
  });

  it("throws ApiError when not ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not found"),
      statusText: "Not Found",
    });
    await expect(del("/x")).rejects.toThrow(ApiError);
  });
});

describe("ApiError", () => {
  it("has name, message, and status", () => {
    const err = new ApiError(404, "Not found");
    expect(err.name).toBe("ApiError");
    expect(err.message).toBe("Not found");
    expect(err.status).toBe(404);
  });
});
