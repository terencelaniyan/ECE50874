import { beforeEach, describe, expect, it, vi } from "vitest";
import { compareDegradation } from "./degradation";
import { post } from "./client";

vi.mock("./client", () => ({
  post: vi.fn(),
}));

describe("compareDegradation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls post with /degradation/compare and request body", async () => {
    const requestBody = {
      ball_id: "ball-1",
      game_count: 30,
    };
    const responseBody = {
      original: { rg: 2.5, diff: 0.05, int_diff: 0.01, factor: 1 },
      v1_linear: { rg: 2.51, diff: 0.049, int_diff: 0.009, factor: 0.95 },
      v2_logarithmic: { rg: 2.505, diff: 0.0495, int_diff: 0.0095, factor: 0.97 },
      game_count: 30,
      coverstock_type: "reactive",
      v2_lambda: 0.12,
    };
    vi.mocked(post).mockResolvedValue(responseBody);

    const result = await compareDegradation(requestBody);

    expect(post).toHaveBeenCalledWith("/degradation/compare", requestBody);
    expect(result).toEqual(responseBody);
  });

  it("propagates client errors", async () => {
    const clientError = new Error("degradation compare failed");
    vi.mocked(post).mockRejectedValue(clientError);

    await expect(compareDegradation({ game_count: 12 })).rejects.toThrow(
      "degradation compare failed"
    );
  });
});
