import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Delaunay } from "d3-delaunay";
import { useBag } from "../context/BagContext";
import { listBalls } from "../api/balls";
import type { Ball } from "../types/ball";

const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 500;

function scaleLinear(
  domain: [number, number],
  range: [number, number]
): (x: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (x: number) => r0 + ((x - d0) / (d1 - d0)) * (r1 - r0);
}

export function GridView() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });
  const [hoveredBall, setHoveredBall] = useState<Ball | null>(null);
  const { addToBag, removeFromBag, arsenalBallIds } = useBag();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listBalls({ limit: 500, offset: 0 })
      .then((res) => {
        if (!cancelled) setBalls(res.items);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setSize({
          w: width - MARGIN.left - MARGIN.right,
          h: height - MARGIN.top - MARGIN.bottom,
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = size.w + MARGIN.left + MARGIN.right;
  const height = size.h + MARGIN.top + MARGIN.bottom;
  const xScale = useCallback(
    (rg: number) =>
      scaleLinear(
        [Math.min(...balls.map((b) => b.rg)), Math.max(...balls.map((b) => b.rg)) || 1],
        [0, size.w]
      )(rg),
    [balls, size.w]
  );
  const yScale = useCallback(
    (diff: number) =>
      scaleLinear(
        [Math.min(...balls.map((b) => b.diff)), Math.max(...balls.map((b) => b.diff)) || 1],
        [size.h, 0]
      )(diff),
    [balls, size.h]
  );

  const chartData = useMemo(() => {
    if (balls.length === 0) return null;
    const pts = balls.map((b) => [xScale(b.rg), yScale(b.diff)] as [number, number]);
    const d = Delaunay.from(pts);
    const v = d.voronoi([-1e9, -1e9, size.w + 1e9, size.h + 1e9]);
    return { points: pts, delaunay: d, voronoi: v };
  }, [balls, size.w, size.h, xScale, yScale]);

  const handlePointClick = useCallback(
    (ball: Ball) => {
      if (arsenalBallIds.includes(ball.ball_id)) {
        removeFromBag(ball.ball_id);
      } else {
        addToBag(ball);
      }
    },
    [arsenalBallIds, addToBag, removeFromBag]
  );

  const handlePointKeyDown = useCallback(
    (ev: React.KeyboardEvent, ball: Ball) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        handlePointClick(ball);
      }
    },
    [handlePointClick]
  );

  if (loading) {
    return (
      <div className="grid-view">
        <p aria-live="polite">Loading grid…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="grid-view">
        <p className="grid-view-error" role="alert">
          {error}
        </p>
      </div>
    );
  }
  if (balls.length === 0) {
    return (
      <div className="grid-view">
        <p>No balls in catalog.</p>
      </div>
    );
  }
  if (!chartData) return null;

  const { voronoi } = chartData;

  return (
    <div className="grid-view">
      <h2>Grid View (RG vs Differential)</h2>
      <svg
        ref={svgRef}
        width="100%"
        height={DEFAULT_HEIGHT + MARGIN.top + MARGIN.bottom}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="grid-view-svg"
        role="img"
        aria-label="Scatter plot of bowling balls by RG and differential. Blue points are in your bag. Click or activate a point to add or remove from bag."
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {balls.map((ball, i) => {
            const cx = xScale(ball.rg);
            const cy = yScale(ball.diff);
            const inBag = arsenalBallIds.includes(ball.ball_id);
            return (
              <g key={ball.ball_id}>
                <path
                  d={voronoi.renderCell(i)}
                  fill="none"
                  stroke="#ccc"
                  strokeWidth={0.5}
                  className="grid-view-cell"
                />
                <g
                  tabIndex={0}
                  role="button"
                  aria-label={`${ball.name}, ${ball.brand}. RG ${ball.rg}, differential ${ball.diff}. ${inBag ? "In bag" : "Not in bag"}. Activate to ${inBag ? "remove from" : "add to"} bag.`}
                  onClick={() => handlePointClick(ball)}
                  onKeyDown={(ev) => handlePointKeyDown(ev, ball)}
                  onMouseEnter={() => setHoveredBall(ball)}
                  onMouseLeave={() => setHoveredBall(null)}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={inBag ? 6 : 4}
                    fill={inBag ? "#0a7ea4" : "#333"}
                    stroke={hoveredBall?.ball_id === ball.ball_id ? "#f90" : "none"}
                    strokeWidth={2}
                  />
                </g>
              </g>
            );
          })}
        </g>
        {hoveredBall && (
          <g
            transform={`translate(${MARGIN.left + xScale(hoveredBall.rg)},${MARGIN.top + yScale(hoveredBall.diff)})`}
          >
            <rect
              x={8}
              y={-24}
              width={120}
              height={44}
              fill="rgba(0,0,0,0.85)"
              rx={4}
              ry={4}
            />
            <text
              x={14}
              y={-8}
              fill="white"
              fontSize={11}
            >
              {hoveredBall.name}
            </text>
            <text
              x={14}
              y={6}
              fill="#ccc"
              fontSize={10}
            >
              {hoveredBall.brand} · RG {hoveredBall.rg} · Diff {hoveredBall.diff}
            </text>
          </g>
        )}
      </svg>
      <p className="grid-view-legend">
        Blue = in bag. Click a point to add/remove from bag.
      </p>
    </div>
  );
}
