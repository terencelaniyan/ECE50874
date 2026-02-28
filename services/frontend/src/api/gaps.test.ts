import { describe, it, expect, vi, beforeEach } from "vitest";
import * as client from "./client";
import { getGaps } from "./gaps";

vi.mock("./client");

describe("getGaps", () => {
  beforeEach(() => {
    vi.mocked(client.post).mockResolvedValue({ items: [] });
  });

  it("calls post with /gaps and request body", async () => {
    const body = { arsenal_ball_ids: ["b1"], k: 10 };
    await getGaps(body);
    expect(client.post).toHaveBeenCalledWith("/gaps", body);
  });
});
