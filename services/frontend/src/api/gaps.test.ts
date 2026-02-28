import { describe, it, expect, vi, beforeEach } from "vitest";
import { getGaps } from "./gaps";
import { apiUrl } from "./client";

const mockFetch = vi.fn();

describe("getGaps", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ zones: [] }),
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

  it("returns response with zones array", async () => {
    const zones = [
      {
        center: [2.52, 0.045],
        label: "Mid RG / Mid Differential",
        description: "Benchmark, versatile.",
        balls: [
          {
            ball: {
              ball_id: "B1",
              name: "Test Ball",
              brand: "Storm",
              rg: 2.52,
              diff: 0.045,
              int_diff: 0.01,
              symmetry: null,
              coverstock_type: null,
              surface_grit: null,
              surface_finish: null,
              release_date: null,
              status: null,
            },
            gap_score: 0.08,
          },
        ],
      },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ zones }),
    });
    const res = await getGaps({ arsenal_ball_ids: [], k: 5 });
    expect(res.zones).toHaveLength(1);
    expect(res.zones[0].label).toBe("Mid RG / Mid Differential");
    expect(res.zones[0].balls).toHaveLength(1);
    expect(res.zones[0].balls[0].ball.ball_id).toBe("B1");
    expect(res.zones[0].balls[0].gap_score).toBe(0.08);
  });
});
