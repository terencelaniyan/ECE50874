import { useState, useEffect, useCallback } from "react";
import { useBag } from "../context/BagContext";
import { getGaps } from "../api/gaps";
import { BallCard } from "./BallCard";
import { BallComparisonTable } from "./BallComparisonTable";
import type { GapItem, GapZone } from "../types/ball";

const MAX_COMPARE = 5;

export function GapsPanel() {
  const { arsenalBallIds, gameCounts, savedArsenalId, addToBag } = useBag();
  const [zones, setZones] = useState<GapZone[]>([]);
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
      const body = savedArsenalId
        ? { arsenal_id: savedArsenalId, k: 10 }
        : {
            arsenal_ball_ids: arsenalBallIds,
            game_counts: Object.keys(gameCounts).length ? gameCounts : undefined,
            k: 10,
          };
      const res = await getGaps(body);
      setZones(res.zones);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load gaps");
    } finally {
      setLoading(false);
    }
  }, [arsenalBallIds, gameCounts, savedArsenalId]);

  useEffect(() => {
    fetchGaps();
  }, [fetchGaps]);

  return (
    <section
      className="gaps-panel"
      aria-labelledby="gaps-heading"
      aria-busy={loading}
    >
      <h2 id="gaps-heading">Gap analysis</h2>
      {error && (
        <p className="gaps-error" role="alert">
          {error}
          <button
            type="button"
            onClick={fetchGaps}
            className="gaps-retry"
            aria-label="Retry loading gap analysis"
          >
            Try again
          </button>
        </p>
      )}
      {loading && (
        <p className="gaps-loading" aria-live="polite">
          Loading…
        </p>
      )}
      {!loading && zones.length === 0 && (
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
            aria-label="Clear comparison table"
          >
            Clear comparison
          </button>
        </div>
      )}
      {!loading && zones.length > 0 && (
        <div className="gap-recommendations">
          {zones.map((zone, i) => (
            <div key={i} className="zone-card">
              <h3 className="zone-title">
                Gap Zone {i + 1}: {zone.label}
              </h3>
              <p className="zone-description">{zone.description}</p>
              <div className="zone-balls">
                {zone.balls.map((item) => {
                  const inCompare = compareItems.some(
                    (c) => c.ball.ball_id === item.ball.ball_id
                  );
                  return (
                    <div key={item.ball.ball_id} className="gaps-item">
                      <BallCard
                        ball={item.ball}
                        onAddToBag={() => addToBag(item.ball)}
                        inBag={arsenalBallIds.includes(item.ball.ball_id)}
                        gapScore={item.gap_score}
                      />
                      <span className="gaps-score">
                        Gap score: {item.gap_score.toFixed(4)}
                      </span>
                      <button
                        type="button"
                        className="gaps-add-to-compare"
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
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
