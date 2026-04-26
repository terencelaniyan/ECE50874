import { useState, useEffect } from "react";
import { listBalls } from "../api/balls";
import { getGaps } from "../api/gaps";
import { BallCatalog } from "./BallCatalog";
import { RecommendationsPanel } from "./RecommendationsPanel";
import { GapsPanel } from "./GapsPanel";
import { GridView } from "./GridView";
import { ArsenalPanel } from "./ArsenalPanel";
import { RecommendationsListCompact } from "./RecommendationsListCompact";
import { BallDatabaseView } from "./BallDatabaseView";
import { SimulationView } from "./SimulationView";
import { SlotAssignmentPanel } from "./SlotAssignmentPanel";
import { AnalysisView } from "./AnalysisView";
import { SimulationView3D } from "./SimulationView3D";
import { useBag } from "../context/BagContext";
import { SLOT_LABELS, SLOT_COLORS } from "../constants/slots";
import type { GapZone } from "../types/ball";

/** Fetches gap zones and renders a pill row showing which slots are uncovered. */
function GapCalloutBanner() {
  const { arsenalBallIds, gameCounts, savedArsenalId, bag } = useBag();
  const [zones, setZones] = useState<GapZone[]>([]);

  useEffect(() => {
    const clearZones = () => {
      setZones((prevZones) => (prevZones.length === 0 ? prevZones : []));
    };

    // Filter custom balls: backend has no record of them
    const catalogIds = arsenalBallIds.filter((id) => !id.startsWith("custom-"));
    if (bag.length === 0 && !savedArsenalId) {
      clearZones();
      return;
    }
    if (catalogIds.length === 0 && !savedArsenalId) {
      clearZones();
      return;
    }
    let cancelled = false;
    const filteredGameCounts = Object.fromEntries(
      Object.entries(gameCounts).filter(([id]) => !id.startsWith("custom-"))
    );
    const body = savedArsenalId
      ? { arsenal_id: savedArsenalId, k: 5 }
      : { arsenal_ball_ids: catalogIds, game_counts: Object.keys(filteredGameCounts).length ? filteredGameCounts : undefined, k: 5 };
    getGaps(body)
      .then((res) => {
        if (!cancelled) setZones(res.zones ?? []);
      })
      .catch(() => {
        if (!cancelled) setZones([]);
      });
    return () => { cancelled = true; };
  }, [arsenalBallIds, gameCounts, savedArsenalId, bag.length]);

  if (bag.length === 0 && !savedArsenalId) return null;

  // Determine which slot names appear in the gap zones
  const gapLabels = zones.map((z) => z.label);

  // Check which of the 5 canonical slots are uncovered
  const canonicalSlots = Object.entries(SLOT_LABELS) as [string, string][];
  const uncoveredSlots = canonicalSlots.filter(([, label]) =>
    gapLabels.some((gl) => gl.toLowerCase().includes(label.toLowerCase().split(" ")[0].toLowerCase()))
  );

  // If we have gap data and no uncovered slots, show full coverage
  const hasFetched = zones.length > 0 || bag.length >= 5;
  if (hasFetched && uncoveredSlots.length === 0 && bag.length > 0) {
    return (
      <div className="gap-callout-banner">
        <span className="gap-callout-ok">✓ Full lane coverage</span>
      </div>
    );
  }

  if (uncoveredSlots.length === 0) return null;

  return (
    <div className="gap-callout-banner">
      <span className="gap-callout-label">⚠ Missing coverage:</span>
      {uncoveredSlots.map(([slotNum, label]) => (
        <span
          key={slotNum}
          className="gap-callout-pill"
          style={{ borderColor: SLOT_COLORS[Number(slotNum)], color: SLOT_COLORS[Number(slotNum)] }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

type Tab = "catalog" | "grid" | "simulation" | "sim3d" | "analysis" | "recommendations" | "gaps" | "database";

/**
 * Main application layout component.
 * 
 * Manages the top-level navigation (tabs) and renders the corresponding view
 * components (Grid, Simulation, Database, etc.). It also includes the shared
 * header and logo.
 */
type RightPanel = "recs" | "slots";

export function Layout() {
  const [tab, setTab] = useState<Tab>("grid");
  const [rightPanel, setRightPanel] = useState<RightPanel>("recs");
  const [ballCount, setBallCount] = useState<number | null>(null);
  const [simInitialParams, setSimInitialParams] = useState<{
    speed: number;
    revRate: number;
    launchAngle: number;
  } | null>(null);

  useEffect(() => {
    listBalls({ limit: 1 })
      .then((res) => setBallCount(res.count))
      .catch(() => setBallCount(null));
  }, []);

  const badgeText =
    ballCount !== null ? `DB: ${ballCount} BALLS LOADED` : "DB: —";

  return (
    <div className="layout">
      <header className="layout-header">
        <div className="logo-wrap">
          <svg className="logo-pin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 121 380" fill="none" aria-hidden>
            <defs>
              <linearGradient id="pin-body" x1="0.3" y1="0" x2="0.7" y2="1">
                <stop offset="0%" stopColor="#fafafa" />
                <stop offset="50%" stopColor="#e8e8e8" />
                <stop offset="100%" stopColor="#d0d0d0" />
              </linearGradient>
              <linearGradient id="pin-stripe" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff3c3c" />
                <stop offset="100%" stopColor="#cc2222" />
              </linearGradient>
              <clipPath id="pin-clip">
                <path d="M60.5 0 
                   C35 0, 32 40, 32 65
                   C32 90, 48 100, 48 125
                   C48 150, 0 190, 0 255
                   C0 320, 34.7 380, 34.7 380
                   L86.3 380
                   C86.3 380, 121 320, 121 255
                   C121 190, 73 150, 73 125
                   C73 100, 89 90, 89 65
                   C89 40, 86 0, 60.5 0 Z" />
              </clipPath>
            </defs>
            {/* Pin body */}
            <path
              d="M60.5 0 
                 C35 0, 32 40, 32 65
                 C32 90, 48 100, 48 125
                 C48 150, 0 190, 0 255
                 C0 320, 34.7 380, 34.7 380
                 L86.3 380
                 C86.3 380, 121 320, 121 255
                 C121 190, 73 150, 73 125
                 C73 100, 89 90, 89 65
                 C89 40, 86 0, 60.5 0 Z"
              fill="url(#pin-body)"
            />
            {/* Stripes clipped to pin shape */}
            <g clipPath="url(#pin-clip)">
              <rect x="0" y="75" width="121" height="12" fill="url(#pin-stripe)" />
              <rect x="0" y="95" width="121" height="12" fill="url(#pin-stripe)" />
            </g>
          </svg>
          <div className="logo">BBG<span>Grid</span></div>
        </div>
        <nav className="header-nav" role="tablist" aria-label="Main sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "grid"}
            aria-controls="panel-grid"
            id="tab-grid"
            className={`nav-btn ${tab === "grid" ? "active" : ""}`}
            onClick={() => setTab("grid")}
          >
            Grid View
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "catalog"}
            aria-controls="panel-catalog"
            id="tab-catalog"
            className={`nav-btn ${tab === "catalog" ? "active" : ""}`}
            onClick={() => setTab("catalog")}
          >
            Catalog
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "simulation"}
            aria-controls="panel-simulation"
            id="tab-simulation"
            className={`nav-btn ${tab === "simulation" ? "active" : ""}`}
            onClick={() => setTab("simulation")}
          >
            Simulation
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "sim3d"}
            aria-controls="panel-sim3d"
            id="tab-sim3d"
            className={`nav-btn ${tab === "sim3d" ? "active" : ""}`}
            onClick={() => setTab("sim3d")}
          >
            3D Sim
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "analysis"}
            aria-controls="panel-analysis"
            id="tab-analysis"
            className={`nav-btn ${tab === "analysis" ? "active" : ""}`}
            onClick={() => setTab("analysis")}
          >
            Analysis
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "database"}
            aria-controls="panel-database"
            id="tab-database"
            className={`nav-btn ${tab === "database" ? "active" : ""}`}
            onClick={() => setTab("database")}
          >
            Ball Database
          </button>
        </nav>
        <div className="status-badge">
          <div className="status-dot" aria-hidden />
          <span>{badgeText}</span>
        </div>
      </header>
      <div className="layout-body">
        <main className="layout-main" role="main">
          {tab === "catalog" && (
            <div
              id="panel-catalog"
              role="tabpanel"
              aria-labelledby="tab-catalog"
              className="view active"
            >
              <BallCatalog />
            </div>
          )}
          {tab === "grid" && (
            <div
              id="panel-grid"
              role="tabpanel"
              aria-labelledby="tab-grid"
              className="view grid-view-layout active"
            >
              <div className="grid-layout">
              <div className="panel arsenal-panel-wrap">
                <ArsenalPanel />
              </div>
              <div className="chart-container">
                <div className="chart-header">
                  <div className="chart-header-title-wrap">
                    <svg className="chart-logo-pin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 121 380" fill="currentColor" aria-hidden>
                      <path d="M60.5 0 
                               C35 0, 32 40, 32 65
                               C32 90, 48 100, 48 125
                               C48 150, 0 190, 0 255
                               C0 320, 34.7 380, 34.7 380
                               L86.3 380
                               C86.3 380, 121 320, 121 255
                               C121 190, 73 150, 73 125
                               C73 100, 89 90, 89 65
                               C89 40, 86 0, 60.5 0 Z" />
                      {/* Simple stripes for the small chart icon */}
                      <rect x="44.5" y="75" width="32" height="15" fill="none" stroke="background" strokeWidth="2" opacity="0.3" />
                      <rect x="42.5" y="100" width="36" height="15" fill="none" stroke="background" strokeWidth="2" opacity="0.3" />
                    </svg>
                    <div className="panel-title">RG — Differential Coverage Map</div>
                  </div>
                  <div className="panel-badge" title="Voronoi tessellation — divides the RG×Differential space into regions showing which slot each area of the chart belongs to.">COVERAGE MAP</div>
                </div>
                <div className="chart-body">
                  <GridView variant="arsenal" />
                </div>
                <GapCalloutBanner />
                <div className="chart-legend">
                  <div className="legend-item">
                    <div className="legend-dot" style={{ background: "var(--accent2)" }} />
                    Slot 1 Heavy Oil
                  </div>
                  <div className="legend-item">
                    <div className="legend-dot" style={{ background: "#ff9c38" }} />
                    Slot 2 Med-Heavy
                  </div>
                  <div className="legend-item">
                    <div className="legend-dot" style={{ background: "var(--accent)" }} />
                    Slot 3 Benchmark
                  </div>
                  <div className="legend-item">
                    <div className="legend-dot" style={{ background: "var(--accent3)" }} />
                    Slot 4 Med-Light
                  </div>
                  <div className="legend-item">
                    <div className="legend-dot" style={{ background: "#b838ff" }} />
                    Slot 5 Spare
                  </div>
                </div>
              </div>
              <div className="panel recs-panel-wrap">
                <div className="panel-header">
                  <div className="right-panel-toggle">
                    <button
                      type="button"
                      className={`right-panel-btn ${rightPanel === "recs" ? "active" : ""}`}
                      onClick={() => setRightPanel("recs")}
                    >
                      Recs
                    </button>
                    <button
                      type="button"
                      className={`right-panel-btn ${rightPanel === "slots" ? "active" : ""}`}
                      onClick={() => setRightPanel("slots")}
                    >
                      Slots
                    </button>
                  </div>
                  <div className="panel-badge">
                    {rightPanel === "recs" ? "RANKED" : "6-BALL"}
                  </div>
                </div>
                <div className="panel-body" id="recs-panel">
                  {rightPanel === "recs" ? <RecommendationsListCompact /> : <SlotAssignmentPanel />}
                </div>
              </div>
            </div>
            </div>
          )}
          {tab === "simulation" && (
            <div
              id="panel-simulation"
              role="tabpanel"
              aria-labelledby="tab-simulation"
              className="view active"
            >
              <SimulationView initialParams={simInitialParams ?? undefined} />
            </div>
          )}
          {tab === "sim3d" && (
            <div
              id="panel-sim3d"
              role="tabpanel"
              aria-labelledby="tab-sim3d"
              className="view active"
            >
              <SimulationView3D initialParams={simInitialParams ?? undefined} />
            </div>
          )}
          {tab === "analysis" && (
            <div
              id="panel-analysis"
              role="tabpanel"
              aria-labelledby="tab-analysis"
              className="view active"
            >
              <AnalysisView
                onSimulateParams={(params) => {
                  setSimInitialParams(params);
                  setTab("simulation");
                }}
              />
            </div>
          )}
          {tab === "recommendations" && (
            <div
              id="panel-recommendations"
              role="tabpanel"
              aria-labelledby="tab-recommendations"
              className="view active"
            >
              <RecommendationsPanel />
            </div>
          )}
          {tab === "gaps" && (
            <div
              id="panel-gaps"
              role="tabpanel"
              aria-labelledby="tab-gaps"
              className="view active"
            >
              <GapsPanel />
            </div>
          )}
          {tab === "database" && (
            <div
              id="panel-database"
              role="tabpanel"
              aria-labelledby="tab-database"
              className="view active"
            >
              <BallDatabaseView />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
