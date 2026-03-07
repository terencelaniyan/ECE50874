import { useState } from "react";
import { BallCatalog } from "./BallCatalog";
import { RecommendationsPanel } from "./RecommendationsPanel";
import { GapsPanel } from "./GapsPanel";
import { GridView } from "./GridView";
import { ArsenalPanel } from "./ArsenalPanel";
import { RecommendationsListCompact } from "./RecommendationsListCompact";
import { BallDatabaseView } from "./BallDatabaseView";
import { SimulationView } from "./SimulationView";

type Tab = "catalog" | "grid" | "simulation" | "recommendations" | "gaps" | "database";

/**
 * Main application layout component.
 * 
 * Manages the top-level navigation (tabs) and renders the corresponding view
 * components (Grid, Simulation, Database, etc.). It also includes the shared
 * header and logo.
 */
export function Layout() {
  const [tab, setTab] = useState<Tab>("grid");

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
          <span>DB: 1360 BALLS LOADED</span>
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
                  <div className="panel-badge">VORONOI</div>
                </div>
                <div className="chart-body">
                  <GridView variant="arsenal" />
                </div>
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
                  <div className="panel-title">Recommendations</div>
                  <div className="panel-badge">K-NN RANKED</div>
                </div>
                <div className="panel-body" id="recs-panel">
                  <RecommendationsListCompact />
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
              <SimulationView />
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
