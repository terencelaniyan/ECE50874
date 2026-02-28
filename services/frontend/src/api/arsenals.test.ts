import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listArsenals,
  getArsenal,
  createArsenal,
  updateArsenal,
  deleteArsenal,
} from "./arsenals";
import { apiUrl } from "./client";

const mockFetch = vi.fn();

describe("arsenals API", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  it("listArsenals calls fetch with /api/arsenals and optional query params", async () => {
    await listArsenals();
    expect(mockFetch).toHaveBeenCalledWith(
      apiUrl("/arsenals"),
      expect.any(Object)
    );
    mockFetch.mockClear();
    await listArsenals({ limit: 10, offset: 20 });
    expect(mockFetch).toHaveBeenCalledWith(
      apiUrl("/arsenals?limit=10&offset=20"),
      expect.any(Object)
    );
  });

  it("getArsenal calls fetch with /api/arsenals/:id", async () => {
    await getArsenal("arsenal-1");
    expect(mockFetch).toHaveBeenCalledWith(
      apiUrl("/arsenals/arsenal-1"),
      expect.any(Object)
    );
  });

  it("createArsenal calls fetch POST with /api/arsenals and body", async () => {
    const body = { name: "My bag", balls: [{ ball_id: "b1", game_count: 0 }] };
    await createArsenal(body);
    expect(mockFetch).toHaveBeenCalledWith(
      apiUrl("/arsenals"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  });

  it("updateArsenal calls fetch PATCH with /api/arsenals/:id and body", async () => {
    await updateArsenal("id-1", { name: "Updated" });
    expect(mockFetch).toHaveBeenCalledWith(
      apiUrl("/arsenals/id-1"),
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      })
    );
  });

  it("deleteArsenal calls fetch DELETE with /api/arsenals/:id", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await deleteArsenal("id-1");
    expect(mockFetch).toHaveBeenCalledWith(apiUrl("/arsenals/id-1"), {
      method: "DELETE",
    });
  });
});
