import { useState, useEffect, useCallback } from "react";
import { useBag } from "../context/BagContext";
import { getGaps } from "../api/gaps";
import { BallCard } from "./BallCard";
import { BallComparisonTable } from "./BallComparisonTable";
import type { GapItem } from "../types/ball";

const MAX_COMPARE = 5;

export function GapsPanel() {
  const { arsenalBallIds, gameCounts, addToBag } = useBag();
  const [items, setItems] = useState<GapItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareItems, setCompareItems] = useState<GapItem[]>([]);

  const toggleCompare = useCallback((item: GapItem) => {
    setCompareItems((prev) => {
      const exists = prev.some((p) => p.ball.ball_id === item.ball.ball_id);
      if (exists) return prev.filter((p) => p.ball.ball_id !== item.ball.ball_id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, item];
    });
  }, []);

  const fetchGaps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getGaps({
        arsenal_ball_ids: arsenalBallIds,
        game_counts: Object.keys(gameCounts).length ? gameCounts : undefined,
        k: 10,
      });
      setItems(res.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load gaps");
    } finally {
      setLoading(false);
    }
  }, [arsenalBallIds, gameCounts]);

  useEffect(() => {
    fetchGaps();
  }, [fetchGaps]);

  return (
    <div className="gaps-panel">
      <h2>Gap analysis</h2>
      {error && (
        <p className="gaps-error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="gaps-loading" aria-live="polite">
          Loading…
        </p>
      )}
      {!loading && items.length === 0 && (
        <p className="gaps-empty">No gap suggestions (or catalog empty).</p>
      )}
      {compareItems.length >= 2 && (
        <div className="gaps-compare">
          <BallComparisonTable
            balls={compareItems.map((i) => i.ball)}
            scoreByBallId={Object.fromEntries(
              compareItems.map((i) => [
                i.ball.ball_id,
                { label: "Gap score", value: i.gap_score },
              ])
            )}
          />
          <button
            type="button"
            className="gaps-clear-compare"
            onClick={() => setCompareItems([])}
          >
            Clear comparison
          </button>
        </div>
      )}
      {!loading && items.length > 0 && (
        <ul className="gaps-list">
          {items.map((item) => {
            const inCompare = compareItems.some(
              (c) => c.ball.ball_id === item.ball.ball_id
            );
            return (
              <li key={item.ball.ball_id} className="gaps-item">
                <BallCard
                  ball={item.ball}
                  onAddToBag={() => addToBag(item.ball)}
                  inBag={arsenalBallIds.includes(item.ball.ball_id)}
                />
                <span className="gaps-score">Gap score: {item.gap_score.toFixed(4)}</span>
                <button
                  type="button"
                  className="gaps-add-to-compare"
                  onClick={() => toggleCompare(item)}
                  disabled={!inCompare && compareItems.length >= MAX_COMPARE}
                >
                  {inCompare ? "Remove from compare" : "Add to compare"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
