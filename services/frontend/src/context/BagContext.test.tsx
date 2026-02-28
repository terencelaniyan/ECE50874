import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { BagProvider, useBag } from "./BagContext";
import { minimalBall, minimalBall2, bagEntry } from "../test/fixtures";

function Consumer() {
  const { bag, addToBag, removeFromBag, setGameCount, setBag, arsenalBallIds, gameCounts } =
    useBag();
  return (
    <div>
      <span data-testid="bag-length">{bag.length}</span>
      <span data-testid="arsenal-ids">{arsenalBallIds.join(",")}</span>
      <span data-testid="game-count-1">{gameCounts[minimalBall.ball_id] ?? "none"}</span>
      <button type="button" onClick={() => addToBag(minimalBall)}>
        Add 1
      </button>
      <button type="button" onClick={() => addToBag(minimalBall2, 5)}>
        Add 2
      </button>
      <button type="button" onClick={() => removeFromBag(minimalBall.ball_id)}>
        Remove 1
      </button>
      <button type="button" onClick={() => setGameCount(minimalBall.ball_id, 10)}>
        Set count
      </button>
      <button
        type="button"
        onClick={() => setBag([bagEntry(minimalBall, 3), bagEntry(minimalBall2, 7)])}
      >
        Set bag
      </button>
    </div>
  );
}

describe("useBag", () => {
  it("throws when used outside BagProvider", () => {
    const expectedMessage = "useBag must be used within BagProvider";
    const consoleError = vi.spyOn(console, "error").mockImplementation((msg) => {
      const s = typeof msg === "string" ? msg : String(msg);
      if (
        s.includes(expectedMessage) ||
        s.includes("The above error occurred") ||
        s.includes("Consider adding an error boundary")
      )
        return;
      console.warn(msg);
    });
    expect(() => render(<Consumer />)).toThrow(expectedMessage);
    consoleError.mockRestore();
  });
});

describe("BagProvider", () => {
  it("exposes initial empty bag and derived state", () => {
    render(
      <BagProvider>
        <Consumer />
      </BagProvider>
    );
    expect(screen.getByTestId("bag-length")).toHaveTextContent("0");
    expect(screen.getByTestId("arsenal-ids")).toHaveTextContent("");
  });

  it("addToBag adds entry and updates arsenalBallIds / gameCounts", () => {
    render(
      <BagProvider>
        <Consumer />
      </BagProvider>
    );
    act(() => {
      screen.getByText("Add 1").click();
    });
    expect(screen.getByTestId("bag-length")).toHaveTextContent("1");
    expect(screen.getByTestId("arsenal-ids")).toHaveTextContent(minimalBall.ball_id);
    expect(screen.getByTestId("game-count-1")).toHaveTextContent("0");

    act(() => {
      screen.getByText("Add 2").click();
    });
    expect(screen.getByTestId("bag-length")).toHaveTextContent("2");
    expect(screen.getByTestId("arsenal-ids").textContent).toContain(minimalBall2.ball_id);
  });

  it("addToBag same ball again is no-op", () => {
    render(
      <BagProvider>
        <Consumer />
      </BagProvider>
    );
    act(() => {
      screen.getByText("Add 1").click();
      screen.getByText("Add 1").click();
    });
    expect(screen.getByTestId("bag-length")).toHaveTextContent("1");
  });

  it("removeFromBag removes entry", () => {
    render(
      <BagProvider>
        <Consumer />
      </BagProvider>
    );
    act(() => {
      screen.getByText("Add 1").click();
    });
    expect(screen.getByTestId("bag-length")).toHaveTextContent("1");
    act(() => {
      screen.getByText("Remove 1").click();
    });
    expect(screen.getByTestId("bag-length")).toHaveTextContent("0");
    expect(screen.getByTestId("arsenal-ids")).toHaveTextContent("");
  });

  it("setGameCount updates game count for ball", () => {
    render(
      <BagProvider>
        <Consumer />
      </BagProvider>
    );
    act(() => {
      screen.getByText("Add 1").click();
    });
    expect(screen.getByTestId("game-count-1")).toHaveTextContent("0");
    act(() => {
      screen.getByText("Set count").click();
    });
    expect(screen.getByTestId("game-count-1")).toHaveTextContent("10");
  });

  it("setBag replaces bag", () => {
    render(
      <BagProvider>
        <Consumer />
      </BagProvider>
    );
    act(() => {
      screen.getByText("Set bag").click();
    });
    expect(screen.getByTestId("bag-length")).toHaveTextContent("2");
    const ids = screen.getByTestId("arsenal-ids").textContent ?? "";
    expect(ids).toContain(minimalBall.ball_id);
    expect(ids).toContain(minimalBall2.ball_id);
  });
});
