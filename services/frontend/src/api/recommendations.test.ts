import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRecommendations } from "./recommendations";
import { post } from "./client";

vi.mock("./client", () => ({
  post: vi.fn(),
}));

describe("getRecommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls post with /recommendations and request body", async () => {
    const requestBody = {
      arsenal_ball_ids: ["ball-1", "ball-2"],
      game_counts: { "ball-1": 12, "ball-2": 4 },
      k: 10,
    };
    const responseBody = { items: [] };
    vi.mocked(post).mockResolvedValue(responseBody);

    const result = await getRecommendations(requestBody);

    expect(post).toHaveBeenCalledWith("/recommendations", requestBody);
    expect(result).toEqual(responseBody);
  });

  it("propagates client errors", async () => {
    const clientError = new Error("recommendations failed");
    vi.mocked(post).mockRejectedValue(clientError);

    await expect(getRecommendations({ arsenal_ball_ids: ["ball-1"] })).rejects.toThrow(
      "recommendations failed"
    );
  });
});
