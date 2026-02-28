import { describe, it, expect, vi, beforeEach } from "vitest";
import { listBalls, getBall } from "./balls";
import { apiUrl } from "./client";

const mockFetch = vi.fn();

describe("listBalls", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], count: 0 }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  it("calls fetch with /api/balls when no params", async () => {
    await listBalls();
    expect(mockFetch).toHaveBeenCalledWith(
      apiUrl("/balls"),
      expect.objectContaining({ signal: undefined })
    );
  });

  it("builds query string from params", async () => {
    await listBalls({
      brand: "Storm",
      coverstock_type: "reactive",
      symmetry: "sym",
      status: "active",
      q: "phantom",
      limit: 20,
      offset: 40,
    });
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain(apiUrl("/balls"));
    expect(url).toContain("?");
    const qs = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    const search = new URLSearchParams(qs);
    expect(search.get("brand")).toBe("Storm");
    expect(search.get("coverstock_type")).toBe("reactive");
    expect(search.get("symmetry")).toBe("sym");
    expect(search.get("status")).toBe("active");
    expect(search.get("q")).toBe("phantom");
    expect(search.get("limit")).toBe("20");
    expect(search.get("offset")).toBe("40");
  });

  it("calls fetch with /api/balls only when params are empty", async () => {
    await listBalls({});
    expect(mockFetch).toHaveBeenCalledWith(
      apiUrl("/balls"),
      expect.objectContaining({ signal: undefined })
    );
  });
});

describe("getBall", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ball_id: "id", name: "X" }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  it("calls fetch with /api/balls/:id and encoded ballId", async () => {
    await getBall("ball-123");
    expect(mockFetch).toHaveBeenCalledWith(
      apiUrl("/balls/ball-123"),
      expect.any(Object)
    );
    await getBall("id/with/slash");
    expect(mockFetch).toHaveBeenLastCalledWith(
      apiUrl("/balls/id%2Fwith%2Fslash"),
      expect.any(Object)
    );
  });
});
