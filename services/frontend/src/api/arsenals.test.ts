import { describe, it, expect, vi, beforeEach } from "vitest";
import * as client from "./client";
import {
  listArsenals,
  getArsenal,
  createArsenal,
  updateArsenal,
  deleteArsenal,
} from "./arsenals";

vi.mock("./client");

describe("arsenals API", () => {
  beforeEach(() => {
    vi.mocked(client.get).mockResolvedValue([] as never);
    vi.mocked(client.post).mockResolvedValue({} as never);
    vi.mocked(client.patch).mockResolvedValue({} as never);
    vi.mocked(client.del).mockResolvedValue(undefined);
  });

  it("listArsenals calls get with /arsenals and optional query params", async () => {
    await listArsenals();
    expect(client.get).toHaveBeenCalledWith("/arsenals");
    vi.mocked(client.get).mockClear();
    await listArsenals({ limit: 10, offset: 20 });
    expect(client.get).toHaveBeenCalledWith("/arsenals?limit=10&offset=20");
  });

  it("getArsenal calls get with /arsenals/:id", async () => {
    await getArsenal("arsenal-1");
    expect(client.get).toHaveBeenCalledWith("/arsenals/arsenal-1");
  });

  it("createArsenal calls post with /arsenals and body", async () => {
    const body = { name: "My bag", balls: [{ ball_id: "b1", game_count: 0 }] };
    await createArsenal(body);
    expect(client.post).toHaveBeenCalledWith("/arsenals", body);
  });

  it("updateArsenal calls patch with /arsenals/:id and body", async () => {
    await updateArsenal("id-1", { name: "Updated" });
    expect(client.patch).toHaveBeenCalledWith("/arsenals/id-1", { name: "Updated" });
  });

  it("deleteArsenal calls del with /arsenals/:id", async () => {
    await deleteArsenal("id-1");
    expect(client.del).toHaveBeenCalledWith("/arsenals/id-1");
  });
});
