import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BagProvider, useBag } from "../context/BagContext";
import { RecommendationsPanel } from "./RecommendationsPanel";
import { getRecommendations } from "../api/recommendations";
import { bagEntry, minimalBall, minimalBall2 } from "../test/fixtures";
import type { Ball, BagEntry, RecommendationItem } from "../types/ball";

vi.mock("../api/recommendations", () => ({
  getRecommendations: vi.fn(),
}));

function makeBall(index: number): Ball {
  return {
    ...minimalBall,
    ball_id: `ball-${index}`,
    name: `Ball ${index}`,
  };
}

function makeRecommendationItem(ball: Ball, score: number): RecommendationItem {
  return { ball, score };
}

function RecommendationsTestHarness({
  initialBagEntries = [],
  initialSavedArsenalId = null,
}: {
  initialBagEntries?: BagEntry[];
  initialSavedArsenalId?: string | null;
}) {
  const { setBag, setSavedArsenalId } = useBag();

  useEffect(() => {
    setBag(initialBagEntries);
    setSavedArsenalId(initialSavedArsenalId);
    // This harness only seeds initial context state once per test render.
  }, []);

  return <RecommendationsPanel />;
}

function renderRecommendationsPanel(options?: {
  initialBagEntries?: BagEntry[];
  initialSavedArsenalId?: string | null;
}) {
  return render(
    <BagProvider>
      <RecommendationsTestHarness
        initialBagEntries={options?.initialBagEntries}
        initialSavedArsenalId={options?.initialSavedArsenalId}
      />
    </BagProvider>
  );
}

describe("RecommendationsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state and skips request when bag is empty with no saved arsenal", async () => {
    renderRecommendationsPanel();

    expect(
      screen.getByText("Add balls to your bag to get recommendations.")
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(getRecommendations).not.toHaveBeenCalled();
    });
  });

  it("fetches recommendations using bag ids and game counts", async () => {
    const bagBall = minimalBall;
    const recommendationItems = [makeRecommendationItem(minimalBall2, 0.8765)];
    vi.mocked(getRecommendations).mockResolvedValue({ items: recommendationItems });

    renderRecommendationsPanel({
      initialBagEntries: [bagEntry(bagBall, 7)],
    });

    await waitFor(() => {
      expect(getRecommendations).toHaveBeenCalledWith({
        arsenal_ball_ids: [bagBall.ball_id],
        game_counts: { [bagBall.ball_id]: 7 },
        k: 10,
      });
    });
    expect(screen.getByText(minimalBall2.name)).toBeInTheDocument();
    expect(screen.getByText("Score: 0.8765")).toBeInTheDocument();
  });

  it("fetches recommendations using saved arsenal id when present", async () => {
    vi.mocked(getRecommendations).mockResolvedValue({ items: [] });

    renderRecommendationsPanel({
      initialSavedArsenalId: "arsenal-123",
    });

    await waitFor(() => {
      expect(getRecommendations).toHaveBeenCalledWith({
        arsenal_id: "arsenal-123",
        k: 10,
      });
    });
  });

  it("shows error then retries successfully", async () => {
    vi.mocked(getRecommendations)
      .mockRejectedValueOnce(new Error("Recommendations failed"))
      .mockResolvedValueOnce({
        items: [makeRecommendationItem(minimalBall2, 0.4321)],
      });

    renderRecommendationsPanel({
      initialBagEntries: [bagEntry(minimalBall, 0)],
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Recommendations failed");
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading recommendations" })
    );

    await waitFor(() => {
      expect(getRecommendations).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText(minimalBall2.name)).toBeInTheDocument();
  });

  it("disables add-to-compare after maximum selections", async () => {
    const recommendationItems = [1, 2, 3, 4, 5, 6].map((index) =>
      makeRecommendationItem(makeBall(index), 1 - index * 0.01)
    );
    vi.mocked(getRecommendations).mockResolvedValue({ items: recommendationItems });

    renderRecommendationsPanel({
      initialBagEntries: [bagEntry(minimalBall, 0)],
    });

    await waitFor(() => {
      expect(screen.getByText("Ball 6")).toBeInTheDocument();
    });

    for (let index = 1; index <= 5; index += 1) {
      fireEvent.click(
        screen.getByRole("button", {
          name: `Add Ball ${index} to comparison`,
        })
      );
    }

    expect(
      screen.getByRole("button", { name: "Add Ball 6 to comparison" })
    ).toBeDisabled();
  });
});
