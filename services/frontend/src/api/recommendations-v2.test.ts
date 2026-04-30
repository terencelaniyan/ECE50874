import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRecommendationsV2 } from "./recommendations-v2";
import { post } from "./client";

vi.mock("./client", () => ({
  post: vi.fn(),
}));

describe("getRecommendationsV2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls post with /recommendations/v2 and request body", async () => {
    const requestBody = {
      arsenal_ball_ids: ["ball-1"],
      method: "hybrid" as const,
      metric: "l2" as const,
      normalize: true,
      degradation_model: "v2" as const,
      diversity_min_distance: 0.2,
      k: 8,
    };
    const responseBody = {
      items: [],
      method: "hybrid",
      degradation_model: "v2",
      normalized: true,
    };
    vi.mocked(post).mockResolvedValue(responseBody);

    const result = await getRecommendationsV2(requestBody);

    expect(post).toHaveBeenCalledWith("/recommendations/v2", requestBody);
    expect(result).toEqual(responseBody);
  });

  it("propagates client errors", async () => {
    const clientError = new Error("v2 request failed");
    vi.mocked(post).mockRejectedValue(clientError);

    await expect(getRecommendationsV2({ arsenal_id: "arsenal-1" })).rejects.toThrow(
      "v2 request failed"
    );
  });
});
