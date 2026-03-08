import { useState, useEffect, useCallback } from "react";
import { useBag } from "../context/BagContext";
import { getRecommendations } from "../api/recommendations";
import { getGaps } from "../api/gaps";
import type { RecommendationItem } from "../types/ball";
import type { GapZone } from "../types/ball";

/** Derive match % from score (lower score = better). Normalize so best in list is 100%, rest scale down. */
function scoreToMatchPercent(score: number, maxScoreInList: number): number {
  if (maxScoreInList <= 0) return 100;
  const pct = 100 - (score / maxScoreInList) * 100;
  return Math.max(0, Math.round(pct));
}

function getReasonText(
  item: RecommendationItem,
  isGapFill: boolean,
): string {
  const { ball } = item;
  const rg = ball.rg.toFixed(2);
  const diff = ball.diff.toFixed(3);
  const cover = ball.coverstock_type ?? "—";
  if (isGapFill) {
    return `Fills gap in coverage. RG ${rg} / Diff ${diff}. ${cover}`;
  }
  return `Similar to arsenal. RG ${rg} / Diff ${diff}. ${cover}`;
}

export function RecommendationsListCompact() {
  const { arsenalBallIds, gameCounts, savedArsenalId, addToBag: addToBagCb } = useBag();
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [gapZones, setGapZones] = useState<GapZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gapBallIds = new Set(
    (gapZones ?? []).flatMap((z) => z.balls.map((b) => b.ball.ball_id))
  );

  const fetchRecsAndGaps = useCallback(async () => {
    if (!savedArsenalId && arsenalBallIds.length === 0) {
      setItems([]);
      setGapZones([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const recBody = savedArsenalId
        ? { arsenal_id: savedArsenalId, k: 10 }
        : { arsenal_ball_ids: arsenalBallIds, game_counts: gameCounts, k: 10 };
      const gapBody = savedArsenalId
        ? { arsenal_id: savedArsenalId, k: 10 }
        : {
            arsenal_ball_ids: arsenalBallIds,
            game_counts: Object.keys(gameCounts).length ? gameCounts : undefined,
            k: 10,
          };
      const [recRes, gapRes] = await Promise.all([
        getRecommendations(recBody),
        getGaps(gapBody),
      ]);
      setItems(recRes.items ?? []);
      setGapZones(gapRes.zones ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setItems([]);
      setGapZones([]);
    } finally {
      setLoading(false);
    }
  }, [arsenalBallIds, gameCounts, savedArsenalId]);

  useEffect(() => {
    fetchRecsAndGaps();
  }, [fetchRecsAndGaps]);

  if (!savedArsenalId && arsenalBallIds.length === 0) {
    return (
      <p className="recs-empty">Add balls to your bag to get recommendations.</p>
    );
  }
  if (error) {
    return (
      <p className="recs-error" role="alert">
        {error}
        <button type="button" onClick={fetchRecsAndGaps} className="recs-retry">
          Try again
        </button>
      </p>
    );
  }
  if (loading) {
    return <p className="recs-loading" aria-live="polite">Loading…</p>;
  }
  if (items.length === 0) {
    return <p className="recs-empty">No recommendations right now.</p>;
  }

  const validItems = (items ?? []).filter((i) => i?.ball);
  const maxScore = Math.max(0, ...validItems.map((i) => i.score));

  return (
    <ul className="rec-list-compact" aria-label="Recommendations">
      {validItems.map((item, i) => {
        const isGapFill = gapBallIds.has(item.ball.ball_id);
        const matchPct = scoreToMatchPercent(item.score, maxScore);
        const reason = getReasonText(item, isGapFill);
        return (
          <li key={item.ball.ball_id} className="rec-item">
            <div className="rec-rank">
              {String(i + 1).padStart(2, "0")}
            </div>
            <div
              className={`rec-badge ${isGapFill ? "gap" : "replacement"}`}
            >
              {isGapFill ? "GAP FILL" : "REPLACEMENT"}
            </div>
            <div className="rec-name">{item.ball.name}</div>
            <div className="rec-reason">{reason}</div>
            <div className="rec-match-row">
              <div className="rec-match-bar-wrap">
                <div
                  className="rec-match-bar-fill"
                  style={{ width: `${matchPct}%` }}
                />
              </div>
              <span className="rec-match-pct">{matchPct}% MATCH</span>
            </div>
            <button
              type="button"
              className="rec-add-btn"
              onClick={() => addToBagCb(item.ball)}
            >
              Add to bag
            </button>
          </li>
        );
      })}
    </ul>
  );
}
