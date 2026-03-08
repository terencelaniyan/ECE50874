import { useState, useEffect, useCallback } from "react";
import { useBag } from "../context/BagContext";
import { getRecommendations } from "../api/recommendations";
import { BallCard } from "./BallCard";
import { BallComparisonTable } from "./BallComparisonTable";
import type { RecommendationItem } from "../types/ball";

const MAX_COMPARE = 5;

export function RecommendationsPanel() {
  const { arsenalBallIds, gameCounts, savedArsenalId, addToBag } = useBag();
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareItems, setCompareItems] = useState<RecommendationItem[]>([]);

  const toggleCompare = useCallback((item: RecommendationItem) => {
    setCompareItems((prev) => {
      const exists = prev.some((p) => p.ball.ball_id === item.ball.ball_id);
      if (exists) return prev.filter((p) => p.ball.ball_id !== item.ball.ball_id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, item];
    });
  }, []);

  const fetchRecs = useCallback(async () => {
    if (savedArsenalId) {
      setLoading(true);
      setError(null);
      try {
        const res = await getRecommendations({ arsenal_id: savedArsenalId, k: 10 });
        setItems(res.items);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load recommendations");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (arsenalBallIds.length === 0) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getRecommendations({
        arsenal_ball_ids: arsenalBallIds,
        game_counts: gameCounts,
        k: 10,
      });
      setItems(res.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load recommendations");
    } finally {
      setLoading(false);
    }
  }, [arsenalBallIds, gameCounts, savedArsenalId]);

  useEffect(() => {
    fetchRecs();
  }, [fetchRecs]);

  return (
    <section
      className="recommendations-panel"
      aria-labelledby="recommendations-heading"
      aria-busy={loading}
    >
      <h2 id="recommendations-heading">Recommendations</h2>
      {arsenalBallIds.length === 0 && (
        <p className="recommendations-empty">Add balls to your bag to get recommendations.</p>
      )}
      {error && (
        <p className="recommendations-error" role="alert">
          {error}
          <button
            type="button"
            onClick={fetchRecs}
            className="recommendations-retry"
            aria-label="Retry loading recommendations"
          >
            Try again
          </button>
        </p>
      )}
      {loading && (
        <p className="recommendations-loading" aria-live="polite">
          Loading…
        </p>
      )}
      {compareItems.length >= 2 && (
        <div className="recommendations-compare">
          <BallComparisonTable
            balls={compareItems.map((i) => i.ball)}
            scoreByBallId={Object.fromEntries(
              compareItems.map((i) => [i.ball.ball_id, { label: "Score", value: i.score }])
            )}
          />
          <button
            type="button"
            className="recommendations-clear-compare"
            onClick={() => setCompareItems([])}
            aria-label="Clear comparison table"
          >
            Clear comparison
          </button>
        </div>
      )}
      {!loading && items.length > 0 && (
        <ul className="recommendations-list">
          {items.map((item) => {
            const inCompare = compareItems.some(
              (c) => c.ball.ball_id === item.ball.ball_id
            );
            return (
              <li key={item.ball.ball_id} className="recommendations-item">
                <BallCard
                  ball={item.ball}
                  onAddToBag={() => addToBag(item.ball)}
                  inBag={arsenalBallIds.includes(item.ball.ball_id)}
                />
                <span className="recommendations-score">Score: {item.score.toFixed(4)}</span>
                <button
                  type="button"
                  className="recommendations-add-to-compare"
                  onClick={() => toggleCompare(item)}
                  disabled={!inCompare && compareItems.length >= MAX_COMPARE}
                  aria-pressed={inCompare}
                  aria-label={
                    inCompare
                      ? `Remove ${item.ball.name} from comparison`
                      : `Add ${item.ball.name} to comparison`
                  }
                >
                  {inCompare ? "Remove from compare" : "Add to compare"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
