import { useState, useEffect, useRef, useCallback } from "react";
import { compareDegradation } from "../api/degradation";
import type { Ball, BagEntry } from "../types/ball";

interface Props {
  entry: BagEntry;
  onClose: () => void;
}

interface CurvePoint {
  games: number;
  v1_rg: number;
  v1_diff: number;
  v2_rg: number;
  v2_diff: number;
}

export function DegradationCompareView({ entry, onClose }: Props) {
  const [points, setPoints] = useState<CurvePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coverstockType, setCoverstockType] = useState<string | null>(null);
  const [lambda, setLambda] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const ball = entry.ball;
  const displayName = ball.name ?? "Custom";
  const coverType = entry.type === "catalog" ? ((ball as Ball).coverstock_type ?? null) : null;

  const fetchCurves = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const gameSteps = Array.from({ length: 20 }, (_, i) => (i + 1) * 10); // 10, 20, ..., 200
      const results = await Promise.all(
        gameSteps.map((g) =>
          compareDegradation({
            ball_id: ball.ball_id.startsWith("custom-") ? undefined : ball.ball_id,
            rg: ball.rg,
            diff: ball.diff,
            int_diff: ball.int_diff,
            coverstock_type: coverType ?? undefined,
            game_count: g,
          })
        )
      );
      const pts: CurvePoint[] = results.map((r, i) => ({
        games: gameSteps[i],
        v1_rg: r.v1_linear.rg,
        v1_diff: r.v1_linear.diff,
        v2_rg: r.v2_logarithmic.rg,
        v2_diff: r.v2_logarithmic.diff,
      }));
      setPoints(pts);
      setCoverstockType(results[0].coverstock_type);
      setLambda(results[0].v2_lambda);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [ball, coverType]);

  useEffect(() => {
    fetchCurves();
  }, [fetchCurves]);

  // Draw chart
  useEffect(() => {
    if (points.length === 0 || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    const pad = { top: 30, right: 20, bottom: 40, left: 55 };
    const chartW = W - pad.left - pad.right;
    const chartH = (H - pad.top - pad.bottom - 30) / 2; // two charts stacked

    const drawChart = (
      yOffset: number,
      label: string,
      getV1: (p: CurvePoint) => number,
      getV2: (p: CurvePoint) => number,
      origVal: number
    ) => {
      // Y range
      const allVals = points.flatMap((p) => [getV1(p), getV2(p)]);
      const yMin = Math.min(...allVals) * 0.98;
      const yMax = Math.max(origVal, ...allVals) * 1.02;
      const xMin = 0;
      const xMax = 200;

      const toX = (g: number) => pad.left + ((g - xMin) / (xMax - xMin)) * chartW;
      const toY = (v: number) => yOffset + chartH - ((v - yMin) / (yMax - yMin)) * chartH;

      // Grid
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let g = 0; g <= 200; g += 50) {
        const x = toX(g);
        ctx.beginPath();
        ctx.moveTo(x, yOffset);
        ctx.lineTo(x, yOffset + chartH);
        ctx.stroke();
      }

      // Label
      ctx.fillStyle = "#6a6a8a";
      ctx.font = "10px 'DM Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(label, pad.left, yOffset - 8);

      // Original value label
      ctx.fillStyle = "#6a6a8a";
      ctx.textAlign = "right";
      ctx.fillText(`Original: ${origVal.toFixed(4)}`, W - pad.right, yOffset - 8);

      // X-axis labels
      ctx.fillStyle = "#6a6a8a";
      ctx.textAlign = "center";
      ctx.font = "9px 'DM Mono', monospace";
      for (let g = 0; g <= 200; g += 50) {
        ctx.fillText(String(g), toX(g), yOffset + chartH + 14);
      }

      // Y-axis labels
      ctx.textAlign = "right";
      const ySteps = 4;
      for (let i = 0; i <= ySteps; i++) {
        const v = yMin + ((yMax - yMin) * i) / ySteps;
        ctx.fillText(v.toFixed(3), pad.left - 6, toY(v) + 3);
      }

      // V1 line (linear) - cyan dashed
      ctx.strokeStyle = "#38c9ff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      points.forEach((p, i) => {
        const x = toX(p.games);
        const y = toY(getV1(p));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // V2 line (logarithmic) - yellow solid
      ctx.strokeStyle = "#e8ff3c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((p, i) => {
        const x = toX(p.games);
        const y = toY(getV2(p));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Draw RG chart
    drawChart(
      pad.top,
      "EFFECTIVE RG",
      (p) => p.v1_rg,
      (p) => p.v2_rg,
      ball.rg
    );

    // Draw Diff chart
    drawChart(
      pad.top + chartH + 30,
      "EFFECTIVE DIFFERENTIAL",
      (p) => p.v1_diff,
      (p) => p.v2_diff,
      ball.diff
    );

    // X-axis label
    ctx.fillStyle = "#6a6a8a";
    ctx.font = "10px 'DM Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("GAMES", W / 2, H - 4);

    // Legend
    const legendY = H - 22;
    ctx.fillStyle = "#38c9ff";
    ctx.fillRect(pad.left, legendY, 16, 3);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = "#38c9ff";
    ctx.beginPath();
    ctx.moveTo(pad.left, legendY + 1.5);
    ctx.lineTo(pad.left + 16, legendY + 1.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#6a6a8a";
    ctx.textAlign = "left";
    ctx.fillText("V1 Linear", pad.left + 22, legendY + 5);

    ctx.fillStyle = "#e8ff3c";
    ctx.fillRect(pad.left + 100, legendY, 16, 3);
    ctx.fillStyle = "#6a6a8a";
    ctx.fillText("V2 Logarithmic", pad.left + 122, legendY + 5);
  }, [points, ball]);

  return (
    <div className="deg-compare-overlay" onClick={onClose}>
      <div className="deg-compare-modal" onClick={(e) => e.stopPropagation()}>
        <div className="deg-compare-header">
          <div>
            <div className="deg-compare-title">{displayName}</div>
            <div className="deg-compare-meta">
              {coverstockType && <span className="deg-compare-chip">{coverstockType}</span>}
              {lambda !== null && <span className="deg-compare-chip">λ = {lambda.toFixed(4)}</span>}
              <span className="deg-compare-chip">RG {ball.rg} / Diff {ball.diff}</span>
            </div>
          </div>
          <button type="button" className="deg-compare-close" onClick={onClose}>
            ✕
          </button>
        </div>
        {loading && <p className="recs-loading">Loading degradation curves…</p>}
        {error && <p className="recs-error">{error}</p>}
        {!loading && !error && (
          <canvas ref={canvasRef} className="deg-compare-canvas" />
        )}
      </div>
    </div>
  );
}
