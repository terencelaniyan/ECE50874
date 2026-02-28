import { useState, useEffect, useCallback } from "react";
import { useBag } from "../context/BagContext";
import { getRecommendations } from "../api/recommendations";
import { BallCard } from "./BallCard";
import type { RecommendationItem } from "../types/ball";

export function RecommendationsPanel() {
  const { arsenalBallIds, gameCounts, addToBag } = useBag();
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecs = useCallback(async () => {
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
  }, [arsenalBallIds, gameCounts]);

  useEffect(() => {
    fetchRecs();
  }, [fetchRecs]);

  return (
    <div className="recommendations-panel">
      <h2>Recommendations</h2>
      {arsenalBallIds.length === 0 && (
        <p className="recommendations-empty">Add balls to your bag to get recommendations.</p>
      )}
      {error && <p className="recommendations-error">{error}</p>}
      {loading && <p className="recommendations-loading">Loading…</p>}
      {!loading && items.length > 0 && (
        <ul className="recommendations-list">
          {items.map((item) => (
            <li key={item.ball.ball_id} className="recommendations-item">
              <BallCard
                ball={item.ball}
                onAddToBag={() => addToBag(item.ball)}
                inBag={arsenalBallIds.includes(item.ball.ball_id)}
              />
              <span className="recommendations-score">Score: {item.score.toFixed(4)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
