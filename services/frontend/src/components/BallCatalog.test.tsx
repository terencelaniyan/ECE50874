import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BagProvider } from "../context/BagContext";
import { BallCatalog } from "./BallCatalog";
import { listBalls } from "../api/balls";
import { minimalBall, minimalBall2 } from "../test/fixtures";

vi.mock("../api/balls", () => ({
  listBalls: vi.fn(),
}));

describe("BallCatalog", () => {
  beforeEach(() => {
    vi.mocked(listBalls).mockReset();
    vi.mocked(listBalls).mockResolvedValue({ items: [], count: 0 });
  });

  function renderCatalog() {
    return render(
      <BagProvider>
        <BallCatalog />
      </BagProvider>
    );
  }

  it("shows loading initially then count and list when listBalls resolves", async () => {
    vi.mocked(listBalls).mockResolvedValue({
      items: [minimalBall, minimalBall2],
      count: 2,
    });
    renderCatalog();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/2 balls?/)).toBeInTheDocument();
    });
    expect(screen.getByText(minimalBall.name)).toBeInTheDocument();
    expect(screen.getByText(minimalBall2.name)).toBeInTheDocument();
  });

  it("shows error when listBalls rejects", async () => {
    vi.mocked(listBalls).mockRejectedValue(new Error("Network error"));
    renderCatalog();
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("calls listBalls with q when search input changes", async () => {
    vi.mocked(listBalls).mockResolvedValue({ items: [], count: 0 });
    renderCatalog();
    await waitFor(() => {
      expect(listBalls).toHaveBeenCalled();
    });
    const searchInput = screen.getByPlaceholderText(/search name/i);
    fireEvent.change(searchInput, { target: { value: "phantom" } });
    await waitFor(() => {
      expect(listBalls).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "phantom" })
      );
    });
  });

  it("shows pagination with Previous/Next and disables at bounds", async () => {
    vi.mocked(listBalls).mockResolvedValue({
      items: [minimalBall],
      count: 1,
    });
    renderCatalog();
    await waitFor(() => {
      expect(screen.getByText(/1 ball/)).toBeInTheDocument();
    });
    const prev = screen.getByRole("button", { name: /previous/i });
    const next = screen.getByRole("button", { name: /next/i });
    expect(prev).toBeDisabled();
    expect(next).toBeDisabled();
    expect(screen.getByText(/1–1 of 1/)).toBeInTheDocument();
  });
});
