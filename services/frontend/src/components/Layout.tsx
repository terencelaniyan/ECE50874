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

export function Layout() {
  const [tab, setTab] = useState<Tab>("grid");

  return (
    <div className="layout">
      <header className="layout-header">
        <div className="logo-wrap">
          <svg className="logo-pin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 0.5 C 9 0.5 8 2 8 4 C 8 5 7.5 5.5 7 6.5 C 6 8 5 11 5 14 C 5 18 7 21 9.5 23 L 12 24 L 14.5 23 C 17 21 19 18 19 14 C 19 11 18 8 17 6.5 C 16.5 5.5 16 5 16 4 C 16 2 15 0.5 12 0.5 z" />
            <line x1="7" y1="5.2" x2="17" y2="5.2" stroke="currentColor" strokeWidth="0.65" strokeLinecap="round" />
            <line x1="7.2" y1="6.4" x2="16.8" y2="6.4" stroke="currentColor" strokeWidth="0.65" strokeLinecap="round" />
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
                    <svg className="chart-logo-pin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12 0.5 C 9 0.5 8 2 8 4 C 8 5 7.5 5.5 7 6.5 C 6 8 5 11 5 14 C 5 18 7 21 9.5 23 L 12 24 L 14.5 23 C 17 21 19 18 19 14 C 19 11 18 8 17 6.5 C 16.5 5.5 16 5 16 4 C 16 2 15 0.5 12 0.5 z" />
                      <line x1="7" y1="5.2" x2="17" y2="5.2" stroke="currentColor" strokeWidth="0.65" strokeLinecap="round" />
                      <line x1="7.2" y1="6.4" x2="16.8" y2="6.4" stroke="currentColor" strokeWidth="0.65" strokeLinecap="round" />
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
