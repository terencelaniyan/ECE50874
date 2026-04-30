import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSlotAssignments } from "./slots";
import { post } from "./client";

vi.mock("./client", () => ({
  post: vi.fn(),
}));

describe("getSlotAssignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls post with /slots and request body", async () => {
    const requestBody = {
      arsenal_ball_ids: ["ball-1", "ball-2"],
      game_counts: { "ball-1": 3, "ball-2": 9 },
    };
    const responseBody = {
      assignments: [],
      best_k: 4,
      silhouette_score: 0.42,
      slot_coverage: [],
    };
    vi.mocked(post).mockResolvedValue(responseBody);

    const result = await getSlotAssignments(requestBody);

    expect(post).toHaveBeenCalledWith("/slots", requestBody);
    expect(result).toEqual(responseBody);
  });

  it("propagates client errors", async () => {
    const clientError = new Error("slot assignment failed");
    vi.mocked(post).mockRejectedValue(clientError);

    await expect(getSlotAssignments({ arsenal_id: "arsenal-1" })).rejects.toThrow(
      "slot assignment failed"
    );
  });
});
