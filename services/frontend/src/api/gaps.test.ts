import { describe, it, expect, vi, beforeEach } from "vitest";
import { getGaps } from "./gaps";
import { apiUrl } from "./client";

const mockFetch = vi.fn();

describe("getGaps", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  it("calls fetch POST with /api/gaps and request body", async () => {
    const body = { arsenal_ball_ids: ["b1"], k: 10 };
    await getGaps(body);
    expect(mockFetch).toHaveBeenCalledWith(
      apiUrl("/gaps"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  });
});
