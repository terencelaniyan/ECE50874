import { describe, it, expect, vi, beforeEach } from "vitest";
import { listBalls, getBall } from "./balls";
import * as client from "./client";

vi.mock("./client");

describe("listBalls", () => {
  beforeEach(() => {
    vi.mocked(client.get).mockReset();
    vi.mocked(client.get).mockResolvedValue({ items: [], count: 0 });
  });

  it("calls get with /balls when no params", async () => {
    await listBalls();
    expect(client.get).toHaveBeenCalledWith("/balls");
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
    const path = vi.mocked(client.get).mock.calls[0]![0];
    expect(path).toContain("/balls?");
    const search = path.slice(path.indexOf("?") + 1);
    const params = new URLSearchParams(search);
    expect(params.get("brand")).toBe("Storm");
    expect(params.get("coverstock_type")).toBe("reactive");
    expect(params.get("symmetry")).toBe("sym");
    expect(params.get("status")).toBe("active");
    expect(params.get("q")).toBe("phantom");
    expect(params.get("limit")).toBe("20");
    expect(params.get("offset")).toBe("40");
  });

  it("calls get with /balls only when params are empty", async () => {
    await listBalls({});
    expect(client.get).toHaveBeenCalledWith("/balls");
  });
});

describe("getBall", () => {
  beforeEach(() => {
    vi.mocked(client.get).mockResolvedValue({ ball_id: "id", name: "X" } as never);
  });

  it("calls get with /balls/:id and encoded ballId", async () => {
    await getBall("ball-123");
    expect(client.get).toHaveBeenCalledWith("/balls/ball-123");
    await getBall("id/with/slash");
    expect(client.get).toHaveBeenLastCalledWith("/balls/id%2Fwith%2Fslash");
  });
});
