import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BagProvider } from "../context/BagContext";
import { BallCatalog } from "./BallCatalog";
import { apiUrl } from "../api/client";
import { minimalBall, minimalBall2 } from "../test/fixtures";

const mockFetch = vi.fn();

describe("BallCatalog", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], count: 0 }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  function renderCatalog() {
    return render(
      <BagProvider>
        <BallCatalog />
      </BagProvider>
    );
  }

  it("shows loading initially then count and list when listBalls resolves", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ items: [minimalBall, minimalBall2], count: 2 }),
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
    mockFetch.mockRejectedValue(new Error("Server error"));
    renderCatalog();
    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("calls listBalls with q when search input changes", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], count: 0 }),
    });
    renderCatalog();
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(apiUrl("/balls")),
        expect.any(Object)
      );
    });
    const searchInput = screen.getByPlaceholderText(/search name/i);
    fireEvent.change(searchInput, { target: { value: "phantom" } });
    await waitFor(
      () => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringMatching(/q=phantom/),
          expect.any(Object)
        );
      },
      { timeout: 500 }
    );
  });

  it("calls listBalls with brand when Brand input changes", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], count: 0 }),
    });
    renderCatalog();
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const brandInput = screen.getByPlaceholderText("Brand");
    fireEvent.change(brandInput, { target: { value: "900" } });
    await waitFor(
      () => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringMatching(/brand=900/),
          expect.any(Object)
        );
      },
      { timeout: 500 }
    );
  });

  it("shows pagination with Previous/Next and disables at bounds", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ items: [minimalBall], count: 1 }),
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
