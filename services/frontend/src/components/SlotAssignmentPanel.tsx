import { useState, useEffect, useCallback } from "react";
import { useBag } from "../context/BagContext";
import { getSlotAssignments } from "../api/slots";
import type { SlotAssignment, SlotCoverage } from "../types/ball";

const SLOT_COLORS: Record<number, string> = {
  1: "#ff5c38",
  2: "#ff9c38",
  3: "#e8ff3c",
  4: "#38c9ff",
  5: "#b838ff",
  6: "#4cff8a",
};

function slotColor(slot: number): string {
  return SLOT_COLORS[slot] ?? "#6a6a8a";
}

export function SlotAssignmentPanel() {
  const { arsenalBallIds, gameCounts, savedArsenalId, bag } = useBag();
  const [assignments, setAssignments] = useState<SlotAssignment[]>([]);
  const [coverage, setCoverage] = useState<SlotCoverage[]>([]);
  const [silhouette, setSilhouette] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSlots = useCallback(async () => {
    const catalogIds = arsenalBallIds.filter((id) => !id.startsWith("custom-"));
    if (!savedArsenalId && catalogIds.length === 0) {
      setAssignments([]);
      setCoverage([]);
      setSilhouette(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const filteredGameCounts = savedArsenalId
        ? gameCounts
        : Object.fromEntries(Object.entries(gameCounts).filter(([id]) => !id.startsWith("custom-")));
      const body = savedArsenalId
        ? { arsenal_id: savedArsenalId }
        : { arsenal_ball_ids: catalogIds, game_counts: filteredGameCounts };
      const res = await getSlotAssignments(body);
      setAssignments(res.assignments ?? []);
      setCoverage(res.slot_coverage ?? []);
      setSilhouette(res.silhouette_score);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load slots");
      setAssignments([]);
      setCoverage([]);
      setSilhouette(null);
    } finally {
      setLoading(false);
    }
  }, [arsenalBallIds, gameCounts, savedArsenalId]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const catalogIds = arsenalBallIds.filter((id) => !id.startsWith("custom-"));
  if (!savedArsenalId && catalogIds.length === 0) {
    return (
      <p className="recs-empty">
        {arsenalBallIds.length === 0
          ? "Add balls to your bag to see slot assignments."
          : "Slot assignments require at least one catalog ball. Add a catalog ball or save your arsenal."}
      </p>
    );
  }
  if (loading) {
    return <p className="recs-loading" aria-live="polite">Loading slots…</p>;
  }
  if (error) {
    return (
      <p className="recs-error" role="alert">
        {error}
        <button type="button" onClick={fetchSlots} className="recs-retry">
          Try again
        </button>
      </p>
    );
  }

  // Build a lookup from ball_id to ball name
  const ballNameMap = new Map(bag.map((e) => [e.ball.ball_id, e.ball.name ?? "Custom"]));

  // Build all 6 slots
  const slots = Array.from({ length: 6 }, (_, i) => {
    const slotNum = i + 1;
    const cov = coverage.find((c) => c.slot === slotNum);
    const assigned = assignments.filter((a) => a.slot === slotNum);
    return { slotNum, name: cov?.name ?? `Slot ${slotNum}`, covered: cov?.covered ?? false, assigned };
  });

  return (
    <div className="slot-panel">
      {silhouette !== null && (
        <div className="slot-silhouette">
          <span className="slot-silhouette-label">SILHOUETTE SCORE</span>
          <span className="slot-silhouette-val">{silhouette.toFixed(3)}</span>
        </div>
      )}
      <div className="slot-grid">
        {slots.map((s) => (
          <div
            key={s.slotNum}
            className={`slot-card ${s.covered ? "covered" : "empty"}`}
            style={{ borderColor: slotColor(s.slotNum) }}
          >
            <div className="slot-card-header">
              <span className="slot-num" style={{ color: slotColor(s.slotNum) }}>
                {s.slotNum}
              </span>
              <span className="slot-name">{s.name}</span>
            </div>
            {s.assigned.length > 0 ? (
              s.assigned.map((a) => (
                <div key={a.ball_id} className="slot-ball">
                  <div className="slot-ball-name">{ballNameMap.get(a.ball_id) ?? a.ball_id.slice(0, 8)}</div>
                  <div className="slot-ball-specs">
                    <span>RG {a.rg.toFixed(2)}</span>
                    <span>Diff {a.diff.toFixed(3)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="slot-empty-label">EMPTY</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
