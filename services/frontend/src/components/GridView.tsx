import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Delaunay } from "d3-delaunay";
import { useBag } from "../context/BagContext";
import { listBalls } from "../api/balls";
import { getGaps } from "../api/gaps";
import { getSlotColor, SLOT_LABELS } from "../constants/slots";
import type { Ball, CustomBall } from "../types/ball";
import type { GapItem, GapZone } from "../types/ball";

/** Ball or custom ball for scatter (rg, diff, ball_id, name, brand). */
type GridBall = Ball | CustomBall;

const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 500;
const TICK_COUNT = 6;
const TICK_SIZE = 6;

/** Fixed domain for the coverage map (RG x Differential).
 * Used in both catalog and arsenal mode to prevent the chart from shifting
 * as data loads in batches.  Covers the practical range of real bowling balls.
 */
const FIXED_RG_DOMAIN: [number, number] = [2.44, 2.78];
const FIXED_DIFF_DOMAIN: [number, number] = [0.010, 0.065];

/** Static slot zones in (rg, diff) for background shading (HTML prototype). */
const SLOT_ZONES: { x: number; x2: number; y: number; y2: number; color: string; label: string }[] = [
  { x: 2.44, x2: 2.52, y: 0.044, y2: 0.065, color: "rgba(255,92,56,0.08)",   label: "Heavy Oil" },
  { x: 2.52, x2: 2.58, y: 0.036, y2: 0.065, color: "rgba(255,156,56,0.07)",  label: "Med-Heavy" },
  { x: 2.52, x2: 2.62, y: 0.02,  y2: 0.036, color: "rgba(232,255,60,0.06)",  label: "Benchmark" },
  { x: 2.58, x2: 2.7,  y: 0.015, y2: 0.042, color: "rgba(56,201,255,0.07)",  label: "Med-Light" },
  { x: 2.64, x2: 2.78, y: 0.020, y2: 0.03,  color: "rgba(184,56,255,0.07)",  label: "Spare" },
];

/**
 * Compute deterministic jitter offsets for balls that share identical (rg, diff)
 * coordinates so they don't render as a single invisible stack.
 */
function computeJitter(balls: { rg: number; diff: number }[], xScale: (v: number) => number, yScale: (v: number) => number): Array<{ dx: number; dy: number }> {
  const key = (b: { rg: number; diff: number }) => `${b.rg.toFixed(4)},${b.diff.toFixed(4)}`;
  const counts: Record<string, number> = {};
  const offsets: Array<{ dx: number; dy: number }> = [];
  for (const b of balls) {
    const k = key(b);
    const idx = counts[k] ?? 0;
    counts[k] = idx + 1;
    if (idx === 0) {
      offsets.push({ dx: 0, dy: 0 });
    } else {
      // spiral offsets: 16px radius, evenly distributed
      const angle = (idx * 2.4) % (2 * Math.PI); // ~golden angle
      const r = 16 + (idx - 1) * 6;
      offsets.push({ dx: Math.cos(angle) * r, dy: Math.sin(angle) * r });
    }
  }
  // We need x/y scale to ensure offsets don't break axis direction — jitter is in pixel space
  void xScale; void yScale;
  return offsets;
}

function scaleLinear(
  domain: [number, number],
  range: [number, number]
): (x: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (x: number) => r0 + ((x - d0) / (d1 - d0)) * (r1 - r0);
}

function tickValues(domain: [number, number], count: number): number[] {
  const [d0, d1] = domain;
  if (d0 === d1) return [d0];
  const step = (d1 - d0) / (count - 1);
  return Array.from({ length: count }, (_, i) => d0 + step * i);
}

export type GridViewVariant = "catalog" | "arsenal";

interface GridViewProps {
  /** When "arsenal", plot only bag balls with fixed domain and slot zones. When "catalog", plot all balls and allow add/remove. */
  variant?: GridViewVariant;
}

/**
 * GridView component for visualizing bowling balls in spec space.
 * 
 * This component renders a scatter plot based on RG and Differential values.
 * It uses D3-Delaunay for Voronoi tessellation to show coverage areas.
 * 
 * In "arsenal" mode, it shows the user's current bag with fixed domains and 
 * slot-based shading. In "catalog" mode, it shows the entire database and 
 * allows adding/removing balls.
 */
export function GridView({ variant = "catalog" }: GridViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [catalogBalls, setCatalogBalls] = useState<Ball[]>([]);
  const [loading, setLoading] = useState(variant === "catalog");
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });
  const [hoveredBall, setHoveredBall] = useState<GridBall | null>(null);
  const { bag, addToBag, removeFromBag, arsenalBallIds, gameCounts, savedArsenalId } = useBag();
  const [gapZones, setGapZones] = useState<GapZone[]>([]);

  const PAGE_SIZE = 200;

  useEffect(() => {
    if (variant !== "catalog") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const fetchAll = async () => {
      const all: Ball[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore && !cancelled) {
        const res = await listBalls({ limit: PAGE_SIZE, offset });
        if (cancelled) return;
        all.push(...res.items);
        hasMore = res.items.length === PAGE_SIZE;
        offset += PAGE_SIZE;
      }
      if (!cancelled) setCatalogBalls(all);
    };
    fetchAll()
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [variant]);

  useEffect(() => {
    const el = containerRef.current ?? svgRef.current?.parentElement;
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
  }, [variant]);

  useEffect(() => {
    const catalogIds = arsenalBallIds.filter((id) => !id.startsWith("custom-"));
    if (variant !== "arsenal" && !savedArsenalId && catalogIds.length === 0) {
      setGapZones([]);
      return;
    }
    if (variant === "arsenal" && bag.length === 0) {
      setGapZones([]);
      return;
    }
    // If only custom balls exist and no saved arsenal, skip gap fetch
    if (!savedArsenalId && catalogIds.length === 0) {
      setGapZones([]);
      return;
    }
    let cancelled = false;
    const filteredGameCounts = Object.fromEntries(
      Object.entries(gameCounts).filter(([id]) => !id.startsWith("custom-"))
    );
    const body = savedArsenalId
      ? { arsenal_id: savedArsenalId, k: 10 }
      : {
          arsenal_ball_ids: catalogIds,
          game_counts: Object.keys(filteredGameCounts).length ? filteredGameCounts : undefined,
          k: 10,
        };
    getGaps(body)
      .then((res) => {
        if (!cancelled) setGapZones(res.zones ?? []);
      })
      .catch(() => {
        if (!cancelled) setGapZones([]);
      });
    return () => {
      cancelled = true;
    };
  }, [variant, arsenalBallIds, gameCounts, bag.length, savedArsenalId]);

  const width = size.w + MARGIN.left + MARGIN.right;
  const height = size.h + MARGIN.top + MARGIN.bottom;

  const isArsenal = variant === "arsenal";
  const balls = isArsenal ? bag.map((e) => e.ball) : catalogBalls;
  // Always use fixed domains so the chart doesn't shift as data loads.
  const rgDomain: [number, number] = FIXED_RG_DOMAIN;
  const diffDomain: [number, number] = FIXED_DIFF_DOMAIN;

  const xScale = useCallback(
    (rg: number) => scaleLinear(rgDomain, [0, size.w])(rg),
    [rgDomain, size.w]
  );
  const yScale = useCallback(
    (diff: number) => scaleLinear(diffDomain, [size.h, 0])(diff),
    [diffDomain, size.h]
  );

  const chartData = useMemo(() => {
    if (balls.length === 0) return null;
    const pts = balls.map((b) => [xScale(b.rg), yScale(b.diff)] as [number, number]);
    const d = Delaunay.from(pts);
    const v = d.voronoi([0, 0, size.w, size.h]);
    return { points: pts, delaunay: d, voronoi: v };
  }, [balls, size.w, size.h, xScale, yScale]);

  const handlePointClick = useCallback(
    (ball: GridBall) => {
      if (!isArsenal) {
        if (arsenalBallIds.includes(ball.ball_id)) {
          removeFromBag(ball.ball_id);
        } else {
          addToBag(ball as Ball);
        }
      }
    },
    [isArsenal, arsenalBallIds, addToBag, removeFromBag]
  );

  const handlePointKeyDown = useCallback(
    (ev: React.KeyboardEvent, ball: GridBall) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        handlePointClick(ball);
      }
    },
    [handlePointClick]
  );

  if (variant === "catalog" && loading) {
    return (
      <div className="grid-view" ref={containerRef}>
        <p aria-live="polite">Loading grid…</p>
      </div>
    );
  }
  if (variant === "catalog" && error) {
    return (
      <div className="grid-view" ref={containerRef}>
        <p className="grid-view-error" role="alert">
          {error}
        </p>
      </div>
    );
  }
  if (variant === "catalog" && catalogBalls.length === 0) {
    return (
      <div className="grid-view" ref={containerRef}>
        <p>No balls in catalog.</p>
      </div>
    );
  }
  if (isArsenal && balls.length === 0) {
    return (
      <div className="grid-view grid-view-arsenal grid-view-onboarding" ref={containerRef}>
        <div className="onboarding-steps">
          <div className="onboarding-title">Get started in 3 steps</div>
          <div className="onboarding-step">
            <span className="onboarding-num">1</span>
            <div>
              <div className="onboarding-step-label">Browse the Catalog</div>
              <div className="onboarding-step-desc">Go to the <strong>Catalog</strong> tab to search 1,360 balls by brand, coverstock, or spec.</div>
            </div>
          </div>
          <div className="onboarding-step">
            <span className="onboarding-num">2</span>
            <div>
              <div className="onboarding-step-label">Add balls to your bag</div>
              <div className="onboarding-step-desc">Click <strong>Add to bag</strong> on any ball. Your bag holds up to 6 slots (a full arsenal).</div>
            </div>
          </div>
          <div className="onboarding-step">
            <span className="onboarding-num">3</span>
            <div>
              <div className="onboarding-step-label">See your coverage map</div>
              <div className="onboarding-step-desc">Return here — this chart plots your balls in <strong>RG × Differential</strong> space and highlights any coverage gaps.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!chartData) return null;

  const zones = gapZones ?? [];
  const gapItems: GapItem[] = zones.flatMap((z) => z.balls);
  const { voronoi } = chartData;
  const rgTicks = tickValues(rgDomain, TICK_COUNT);
  const diffTicks = tickValues(diffDomain, TICK_COUNT);

  const firstGapCenter =
    zones.length > 0 && zones[0].center?.length >= 2
      ? (zones[0].center as [number, number])
      : null;

  return (
    <div
      className={`grid-view ${isArsenal ? "grid-view-arsenal" : ""}`}
      ref={containerRef}
      style={isArsenal ? { height: "100%", minHeight: 0 } : undefined}
    >
      {variant === "catalog" && (
        <h2>Grid View (RG vs Differential)</h2>
      )}
      <div className="grid-view-svg-wrap" style={isArsenal ? { flex: 1, minHeight: 0 } : undefined}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="grid-view-svg"
          role="img"
          aria-label={
            isArsenal
              ? "RG vs Differential coverage map of your arsenal. Slot zones and gap highlighted."
              : "Scatter plot of bowling balls by RG and differential. Blue points are in your bag. Click to add or remove from bag."
          }
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {/* Slot zone backgrounds (arsenal mode only) */}
            {isArsenal &&
              SLOT_ZONES.map((z, i) => (
                <g key={i}>
                  <rect
                    x={xScale(z.x)}
                    y={yScale(z.y2)}
                    width={xScale(z.x2) - xScale(z.x)}
                    height={yScale(z.y) - yScale(z.y2)}
                    fill={z.color}
                    stroke="rgba(255,255,255,0.06)"
                    strokeDasharray="4,4"
                  />
                  <text
                    x={xScale(z.x) + 10}
                    y={yScale(z.y2) + 20}
                    fill="var(--muted)"
                    fontSize={10}
                    fontWeight="800"
                    opacity={0.4}
                    style={{ pointerEvents: "none" }}
                  >
                    SLOT {i + 1}
                  </text>
                </g>
              ))}

            {/* Gap zone (arsenal mode: dashed ellipse at first zone center) */}
            {isArsenal && firstGapCenter && (
              <g className="gap-indicator">
                <ellipse
                  cx={xScale(firstGapCenter[0])}
                  cy={yScale(firstGapCenter[1])}
                  rx={28}
                  ry={20}
                  fill="rgba(255,92,56,0.1)"
                  stroke="rgba(255,92,56,0.6)"
                  strokeDasharray="6,3"
                  strokeWidth={1.5}
                  className="pulsing-gap"
                />
                <text
                  x={xScale(firstGapCenter[0])}
                  y={yScale(firstGapCenter[1]) + 3}
                  textAnchor="middle"
                  fill="#ff5c38"
                  fontSize={9}
                  fontWeight="800"
                >
                  GAP
                </text>
              </g>
            )}

            {/* Voronoi cells */}
            {(() => {
              const jitter = computeJitter(balls, xScale, yScale);
              return balls.map((ball, i) => {
                const slot = isArsenal ? Math.min(i + 1, 5) : 0;
                const slotColor = isArsenal ? getSlotColor(slot) + "20" : "none";
                const strokeColor = isArsenal ? getSlotColor(slot) + "60" : "#ccc";
                const inBag = arsenalBallIds.includes(ball.ball_id);
                const isGapFiller = gapItems.some((g) => g.ball.ball_id === ball.ball_id);
                const pointRadius = inBag || isArsenal ? 14 : isGapFiller ? 6 : 4;
                const pointFill =
                  isArsenal ? getSlotColor(slot) : inBag ? "#0a7ea4" : isGapFiller ? "#e09500" : "#444";
                const { dx, dy } = jitter[i];
                const cx = xScale(ball.rg) + dx;
                const cy = yScale(ball.diff) + dy;
                const slotLabel = isArsenal ? SLOT_LABELS[slot] ?? `Slot ${slot}` : "";

                return (
                  <g key={ball.ball_id}>
                    <path
                      d={voronoi.renderCell(i)}
                      fill={isArsenal ? slotColor : inBag ? "none" : "rgba(255, 180, 0, 0.12)"}
                      stroke={isArsenal ? strokeColor : inBag ? "#ccc" : "#e09500"}
                      strokeWidth={isArsenal ? 1.5 : inBag ? 0.5 : 0.8}
                      className="grid-view-cell"
                    />
                    <g
                      tabIndex={isArsenal ? undefined : 0}
                      role={isArsenal ? "img" : "button"}
                      aria-label={
                        isArsenal
                          ? `${ball.name ?? "Custom"}, Slot ${slot} – ${slotLabel}. RG ${ball.rg}, Diff ${ball.diff}.`
                          : `${ball.name ?? "Custom"}, ${ball.brand ?? ""}. RG ${ball.rg}, differential ${ball.diff}. ${inBag ? "In bag" : "Not in bag"}. Activate to ${inBag ? "remove from" : "add to"} bag.`
                      }
                      onClick={() => handlePointClick(ball)}
                      onKeyDown={isArsenal ? undefined : (ev) => handlePointKeyDown(ev, ball)}
                      onMouseEnter={() => setHoveredBall(ball)}
                      onMouseLeave={() => setHoveredBall(null)}
                      style={{ cursor: isArsenal ? "default" : "pointer" }}
                    >
                      {/* Outer glow ring */}
                      {isArsenal && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={pointRadius + 5}
                          fill="none"
                          stroke={getSlotColor(slot)}
                          strokeWidth={1}
                          opacity={0.3}
                        />
                      )}
                      {/* Main dot */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={pointRadius}
                        fill={pointFill}
                        stroke={isArsenal ? "#0a0a0f" : hoveredBall?.ball_id === ball.ball_id ? "#f90" : "none"}
                        strokeWidth={isArsenal ? 2 : 1.5}
                      />
                      {/* Slot number inside dot */}
                      {isArsenal && (
                        <text
                          x={cx}
                          y={cy + 4}
                          textAnchor="middle"
                          fill="#0a0a0f"
                          fontSize={10}
                          fontWeight="900"
                          style={{ pointerEvents: "none" }}
                        >
                          {slot}
                        </text>
                      )}
                      {/* Label pill outside dot */}
                      {isArsenal && (
                        <g style={{ pointerEvents: "none" }}>
                          <rect
                            x={cx - 28}
                            y={cy - pointRadius - 20}
                            width={56}
                            height={16}
                            rx={4}
                            fill="rgba(10,10,15,0.85)"
                            stroke={getSlotColor(slot)}
                            strokeWidth={1}
                          />
                          <text
                            x={cx}
                            y={cy - pointRadius - 8}
                            textAnchor="middle"
                            fill={getSlotColor(slot)}
                            fontSize={8}
                            fontWeight="700"
                            letterSpacing={0.5}
                          >
                            {slotLabel.toUpperCase()}
                          </text>
                        </g>
                      )}
                    </g>
                  </g>
                );
              });
            })()}

            {/* Axes */}
            <g className="grid-view-axes" aria-hidden="true">
              <line x1={0} y1={size.h} x2={size.w} y2={size.h} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
              {rgTicks.map((rg) => {
                const x = xScale(rg);
                return (
                  <g key={rg}>
                    <line x1={x} y1={size.h} x2={x} y2={size.h + TICK_SIZE} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
                    <text x={x} y={size.h + TICK_SIZE + 12} textAnchor="middle" fill="var(--text-muted)" fontSize={10}>
                      {rg.toFixed(2)}
                    </text>
                  </g>
                );
              })}
              <text
                x={size.w / 2}
                y={size.h + 36}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize={11}
              >
                {isArsenal ? "RADIUS OF GYRATION (RG)" : "RG"}
              </text>
              <line x1={0} y1={0} x2={0} y2={size.h} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
              {diffTicks.map((diff) => {
                const y = yScale(diff);
                return (
                  <g key={diff}>
                    <line x1={0} y1={y} x2={-TICK_SIZE} y2={y} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
                    <text
                      x={-TICK_SIZE - 4}
                      y={y}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fill="var(--text-muted)"
                      fontSize={10}
                    >
                      {diff.toFixed(2)}
                    </text>
                  </g>
                );
              })}
              <text
                x={-MARGIN.left / 2}
                y={size.h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--text-muted)"
                fontSize={11}
                transform={`rotate(-90, ${-MARGIN.left / 2}, ${size.h / 2})`}
              >
                DIFFERENTIAL
              </text>
            </g>
          </g>

          {/* Tooltip */}
          {hoveredBall && (
            <g
              transform={`translate(${MARGIN.left + xScale(hoveredBall.rg)},${MARGIN.top + yScale(hoveredBall.diff)})`}
            >
              <rect
                x={8}
                y={-24}
                width={140}
                height={52}
                fill="var(--surface-color)"
                stroke="var(--border-color)"
                rx={4}
                ry={4}
              />
              <text x={14} y={-8} fill="var(--text-main)" fontSize={11}>
                {hoveredBall.name ?? "Custom"}
              </text>
              <text x={14} y={6} fill="var(--text-muted)" fontSize={10}>
                {hoveredBall.brand ?? ""} · RG {hoveredBall.rg} · Diff {hoveredBall.diff}
              </text>
              <text x={14} y={20} fill="var(--text-dim)" fontSize={10}>
                Cover: {"coverstock_type" in hoveredBall ? (hoveredBall.coverstock_type ?? "—") : (hoveredBall.surface_grit ?? hoveredBall.surface_finish ?? "—")}
                {isArsenal &&
                  ` · Slot ${balls.indexOf(hoveredBall) + 1}`}
              </text>
            </g>
          )}
        </svg>
      </div>
      {variant === "catalog" && (
        <p className="grid-view-legend">
          Blue = in bag. Shaded region = gap. Orange = suggested to fill a gap. Click a point to add/remove from bag.
        </p>
      )}
    </div>
  );
}
