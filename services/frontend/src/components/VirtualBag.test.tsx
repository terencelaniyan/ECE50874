import { describe, it, expect } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { BagProvider, useBag } from "../context/BagContext";
import { VirtualBag } from "./VirtualBag";
import { server } from "../test/server";
import { minimalBall, bagEntry } from "../test/fixtures";

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
  it("renders empty bag and Save/Load arsenal buttons", () => {
    render(
      <BagProvider>
        <VirtualBag />
      </BagProvider>
    );
    expect(screen.getByText(/MY BAG \(0\/6\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save arsenal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load arsenal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save arsenal/i })).toBeDisabled();
  });

  it("opens save modal and calls createArsenal when bag has items", async () => {
    let postBody: { balls?: { ball_id: string }[] } = {};
    server.use(
      http.post("*/api/arsenals", async ({ request }) => {
        postBody = (await request.json()) as { balls?: { ball_id: string }[] };
        return HttpResponse.json({ id: "new-id", name: "Saved", balls: [] });
      })
    );
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
      expect(postBody.balls).toBeDefined();
      expect(postBody.balls?.some((b) => b.ball_id === minimalBall.ball_id)).toBe(true);
    });
  });

  it("Load arsenal opens modal and fetches list", async () => {
    server.use(
      http.get("*/api/arsenals", () => {
        return HttpResponse.json([
          { id: "a1", name: "Bag 1", ball_count: 2 },
        ]);
      })
    );
    render(
      <BagProvider>
        <VirtualBag />
      </BagProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /load arsenal/i }));
    await waitFor(() => {
      expect(screen.getByText(/Bag 1/)).toBeInTheDocument();
    });
  });

  it("handleLoad fetches arsenal and balls then updates bag", async () => {
    server.use(
      http.get("*/api/arsenals", () => {
        return HttpResponse.json([
          { id: "arsenal-1", name: "My bag", ball_count: 1 },
        ]);
      }),
      http.get("*/api/arsenals/arsenal-1", () => {
        return HttpResponse.json({
          id: "arsenal-1",
          name: "My bag",
          balls: [{ ball_id: minimalBall.ball_id, game_count: 1 }],
        });
      }),
      http.get(`*/api/balls/${minimalBall.ball_id}`, () => {
        return HttpResponse.json(minimalBall);
      })
    );
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
      expect(screen.getByText(minimalBall.name)).toBeInTheDocument();
    });
  });

  it("shows error when createArsenal fails", async () => {
    server.use(
      http.post("*/api/arsenals", () => {
        return new HttpResponse("Server error", {
          status: 500,
          statusText: "Server Error",
        });
      })
    );
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
