import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BagProvider, useBag } from "../context/BagContext";
import { VirtualBag } from "./VirtualBag";
import * as arsenals from "../api/arsenals";
import * as balls from "../api/balls";
import { minimalBall, bagEntry } from "../test/fixtures";

vi.mock("../api/arsenals");
vi.mock("../api/balls");

function TestWrapper() {
  const { setBag } = useBag();
  return (
    <>
      <button type="button" onClick={() => setBag([bagEntry(minimalBall, 0)])}>
        Set bag
      </button>
      <VirtualBag />
    </>
  );
}

describe("VirtualBag", () => {
  beforeEach(() => {
    vi.mocked(arsenals.listArsenals).mockResolvedValue([]);
    vi.mocked(arsenals.getArsenal).mockResolvedValue({
      id: "arsenal-1",
      name: "My bag",
      balls: [{ ball_id: minimalBall.ball_id, game_count: 3 }],
    });
    vi.mocked(arsenals.createArsenal).mockResolvedValue({
      id: "new-id",
      name: "Saved",
      balls: [],
    });
    vi.mocked(arsenals.updateArsenal).mockResolvedValue({
      id: "arsenal-1",
      name: null,
      balls: [],
    });
    vi.mocked(arsenals.deleteArsenal).mockResolvedValue();
    vi.mocked(balls.getBall).mockResolvedValue(minimalBall);
  });

  it("renders empty bag and Save/Load arsenal buttons", () => {
    render(
      <BagProvider>
        <VirtualBag />
      </BagProvider>
    );
    expect(screen.getByRole("heading", { name: /virtual bag/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save arsenal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load arsenal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save arsenal/i })).toBeDisabled();
  });

  it("opens save modal and calls createArsenal when bag has items", async () => {
    render(
      <BagProvider>
        <TestWrapper />
      </BagProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /set bag/i }));
    await waitFor(() => {
      expect(screen.getByText(minimalBall.name)).toBeInTheDocument();
    });
    const saveArsenalBtn = screen.getByRole("button", { name: /save arsenal/i });
    expect(saveArsenalBtn).not.toBeDisabled();
    fireEvent.click(saveArsenalBtn);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/arsenal name/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(arsenals.createArsenal).toHaveBeenCalledWith({
        name: undefined,
        balls: [{ ball_id: minimalBall.ball_id, game_count: 0 }],
      });
    });
  });

  it("Load arsenal opens modal and fetches list", async () => {
    vi.mocked(arsenals.listArsenals).mockResolvedValue([
      { id: "a1", name: "Bag 1", ball_count: 2 },
    ]);
    render(
      <BagProvider>
        <VirtualBag />
      </BagProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /load arsenal/i }));
    await waitFor(() => {
      expect(arsenals.listArsenals).toHaveBeenCalledWith({ limit: 50 });
    });
    await waitFor(() => {
      expect(screen.getByText(/Bag 1/)).toBeInTheDocument();
    });
  });

  it("handleLoad fetches arsenal and balls then updates bag", async () => {
    vi.mocked(arsenals.listArsenals).mockResolvedValue([
      { id: "arsenal-1", name: "My bag", ball_count: 1 },
    ]);
    render(
      <BagProvider>
        <VirtualBag />
      </BagProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /load arsenal/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /My bag \(1\)/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /My bag \(1\)/ }));
    await waitFor(() => {
      expect(arsenals.getArsenal).toHaveBeenCalledWith("arsenal-1");
    });
    await waitFor(() => {
      expect(balls.getBall).toHaveBeenCalledWith(minimalBall.ball_id);
    });
    await waitFor(() => {
      expect(screen.getByText(minimalBall.name)).toBeInTheDocument();
    });
  });

  it("shows error when createArsenal fails", async () => {
    vi.mocked(arsenals.createArsenal).mockRejectedValue(new Error("Server error"));
    render(
      <BagProvider>
        <TestWrapper />
      </BagProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /set bag/i }));
    await waitFor(() => {
      expect(screen.getByText(minimalBall.name)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /save arsenal/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/arsenal name/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });
});
