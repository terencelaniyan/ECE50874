import { useState, useEffect, useCallback } from "react";
import { useBag } from "../context/BagContext";
import { getGaps } from "../api/gaps";
import { BallCard } from "./BallCard";
import type { GapItem } from "../types/ball";

export function GapsPanel() {
  const { arsenalBallIds, gameCounts, addToBag } = useBag();
  const [items, setItems] = useState<GapItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      {error && <p className="gaps-error">{error}</p>}
      {loading && <p className="gaps-loading">Loading…</p>}
      {!loading && items.length === 0 && (
        <p className="gaps-empty">No gap suggestions (or catalog empty).</p>
      )}
      {!loading && items.length > 0 && (
        <ul className="gaps-list">
          {items.map((item) => (
            <li key={item.ball.ball_id} className="gaps-item">
              <BallCard
                ball={item.ball}
                onAddToBag={() => addToBag(item.ball)}
                inBag={arsenalBallIds.includes(item.ball.ball_id)}
              />
              <span className="gaps-score">Gap score: {item.gap_score.toFixed(4)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
