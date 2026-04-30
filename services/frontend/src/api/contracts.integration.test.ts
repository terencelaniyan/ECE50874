import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRecommendations } from "./recommendations";
import { getRecommendationsV2 } from "./recommendations-v2";
import { getGaps } from "./gaps";
import { getSlotAssignments } from "./slots";
import { compareDegradation } from "./degradation";

function errorResponse(status: number, message: string) {
  return {
    ok: false,
    status,
    statusText: "error",
    json: () => Promise.resolve({ detail: message }),
    text: () => Promise.resolve(message),
  };
}

describe("API error contracts integration", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errorResponse(400, "bad request payload"))
    );
  });

  it("propagates backend error text for recommendations endpoints", async () => {
    await expect(getRecommendations({ arsenal_ball_ids: ["B001"] })).rejects.toThrow(
      "bad request payload"
    );
    await expect(getRecommendationsV2({ arsenal_ball_ids: ["B001"] })).rejects.toThrow(
      "bad request payload"
    );
  });

  it("propagates backend error text for gaps and slots", async () => {
    await expect(getGaps({ arsenal_ball_ids: ["B001"] })).rejects.toThrow(
      "bad request payload"
    );
    await expect(getSlotAssignments({ arsenal_ball_ids: ["B001"] })).rejects.toThrow(
      "bad request payload"
    );
  });

  it("propagates backend error text for degradation compare", async () => {
    await expect(compareDegradation({ game_count: 10 })).rejects.toThrow(
      "bad request payload"
    );
  });
});
