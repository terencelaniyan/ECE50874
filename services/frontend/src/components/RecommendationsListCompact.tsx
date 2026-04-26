import { useState, useEffect, useCallback } from "react";
import { useBag } from "../context/BagContext";
import { getRecommendations } from "../api/recommendations";
import { getRecommendationsV2 } from "../api/recommendations-v2";
import { getGaps } from "../api/gaps";
import type { RecommendationItem, RecommendV2Item } from "../types/ball";
import type { GapZone } from "../types/ball";

type RecMethod = "knn" | "two_tower" | "hybrid";

/** Derive match % from score (lower score = better).
 * Spreads scores to 60–99% so similar items show differentiated bars.
 * When all scores are equal, items rank proportionally by position (rank 1 = 99%, last = 60%).
 */
function scoreToMatchPercent(score: number, minScore: number, maxScore: number, rank: number, total: number): number {
  const RANGE_MAX = 99;
  const RANGE_MIN = 60;
  if (total <= 1) return RANGE_MAX;
  // If all scores are identical, fall back to rank-based spread
  if (Math.abs(maxScore - minScore) < 1e-9) {
    const rankPct = 1 - (rank / (total - 1));
    return Math.round(RANGE_MIN + rankPct * (RANGE_MAX - RANGE_MIN));
  }
  const pct = 1 - (score - minScore) / (maxScore - minScore);
  return Math.max(RANGE_MIN, Math.min(RANGE_MAX, Math.round(RANGE_MIN + pct * (RANGE_MAX - RANGE_MIN))));
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
  const [items, setItems] = useState<(RecommendationItem | RecommendV2Item)[]>([]);
  const [gapZones, setGapZones] = useState<GapZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<RecMethod>("knn");

  const gapBallIds = new Set(
    (gapZones ?? []).flatMap((z) => z.balls.map((b) => b.ball.ball_id))
  );

  // Filter out custom ball IDs (those starting with "custom-") before hitting the
  // recommendations API — the backend DB has no record of them and returns a 404.
  const catalogBallIds = arsenalBallIds.filter((id) => !id.startsWith("custom-"));
  const hasOnlyCustomBalls = arsenalBallIds.length > 0 && catalogBallIds.length === 0;

  const fetchRecsAndGaps = useCallback(async () => {
    if (!savedArsenalId && catalogBallIds.length === 0) {
      setItems([]);
      setGapZones([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const filteredGameCounts = savedArsenalId
        ? gameCounts
        : Object.fromEntries(
            Object.entries(gameCounts).filter(([id]) => !id.startsWith("custom-"))
          );

      const gapBody = savedArsenalId
        ? { arsenal_id: savedArsenalId, k: 10 }
        : {
            arsenal_ball_ids: catalogBallIds,
            game_counts: Object.keys(filteredGameCounts).length ? filteredGameCounts : undefined,
            k: 10,
          };

      if (method === "knn") {
        const recBody = savedArsenalId
          ? { arsenal_id: savedArsenalId, k: 10 }
          : { arsenal_ball_ids: catalogBallIds, game_counts: filteredGameCounts, k: 10 };
        const [recRes, gapRes] = await Promise.all([
          getRecommendations(recBody),
          getGaps(gapBody),
        ]);
        setItems(recRes.items ?? []);
        setGapZones(gapRes.zones ?? []);
      } else {
        const recBody = savedArsenalId
          ? { arsenal_id: savedArsenalId, k: 10, method }
          : { arsenal_ball_ids: catalogBallIds, game_counts: filteredGameCounts, k: 10, method };
        const [recRes, gapRes] = await Promise.all([
          getRecommendationsV2(recBody),
          getGaps(gapBody),
        ]);
        setItems(recRes.items ?? []);
        setGapZones(gapRes.zones ?? []);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setItems([]);
      setGapZones([]);
    } finally {
      setLoading(false);
    }
  }, [catalogBallIds, gameCounts, savedArsenalId, method]);

  useEffect(() => {
    fetchRecsAndGaps();
  }, [fetchRecsAndGaps]);

  if (!savedArsenalId && arsenalBallIds.length === 0) {
    return (
      <p className="recs-empty">Add balls to your bag to get recommendations.</p>
    );
  }

  if (hasOnlyCustomBalls && !savedArsenalId) {
    return (
      <p className="recs-empty">
        Recommendations require at least one catalog ball. Custom-only arsenals cannot be
        matched against the database — add a catalog ball or save your arsenal first.
      </p>
    );
  }

  const methodToggle = (
    <div className="rec-method-toggle">
      {(["knn", "two_tower", "hybrid"] as RecMethod[]).map((m) => (
        <button
          key={m}
          type="button"
          className={`rec-method-btn ${method === m ? "active" : ""}`}
          onClick={() => setMethod(m)}
        >
          {m === "knn" ? "KNN" : m === "two_tower" ? "V2" : "Hybrid"}
        </button>
      ))}

    </div>
  );

  if (error) {
    return (
      <>
        {methodToggle}
        <p className="recs-error" role="alert">
          {error}
          <button type="button" onClick={fetchRecsAndGaps} className="recs-retry">
            Try again
          </button>
        </p>
      </>
    );
  }
  if (loading) {
    return (
      <>
        {methodToggle}
        <p className="recs-loading" aria-live="polite">Loading…</p>
      </>
    );
  }
  if (items.length === 0) {
    return (
      <>
        {methodToggle}
        <p className="recs-empty">No recommendations right now.</p>
      </>
    );
  }

  const validItems = (items ?? []).filter((i) => i?.ball);
  const scores = validItems.map((i) => i.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);

  return (
    <>
      {methodToggle}
      <ul className="rec-list-compact" aria-label="Recommendations">
        {validItems.map((item, i) => {
          const isGapFill = gapBallIds.has(item.ball.ball_id);
          const matchPct = scoreToMatchPercent(item.score, minScore, maxScore, i, validItems.length);
          const isV2 = "method" in item;
          const reason = isV2 && (item as RecommendV2Item).reason
            ? (item as RecommendV2Item).reason!
            : getReasonText(item, isGapFill);
          const itemMethod = isV2 ? (item as RecommendV2Item).method : "knn";
          return (
            <li key={item.ball.ball_id} className="rec-item">
              <div className="rec-rank">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="rec-badges-row">
                <div
                  className={`rec-badge ${isGapFill ? "gap" : "replacement"}`}
                >
                  {isGapFill ? "GAP FILL" : "REPLACEMENT"}
                </div>
                <div className={`rec-badge method method-${itemMethod}`}>
                  {itemMethod === "knn" ? "KNN" : itemMethod === "two_tower" ? "V2" : "HYBRID"}
                </div>
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
    </>
  );
}
