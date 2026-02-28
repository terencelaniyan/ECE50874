import { useState } from "react";
import { VirtualBag } from "./VirtualBag";
import { BallCatalog } from "./BallCatalog";
import { RecommendationsPanel } from "./RecommendationsPanel";
import { GapsPanel } from "./GapsPanel";
import { GridView } from "./GridView";

type Tab = "catalog" | "grid" | "recommendations" | "gaps";

export function Layout() {
  const [tab, setTab] = useState<Tab>("catalog");

  return (
    <div className="layout">
      <header className="layout-header">
        <h1>Bowling Bowl Grid</h1>
      </header>
      <div className="layout-body">
        <aside className="layout-sidebar">
          <VirtualBag />
          <nav className="tabs" role="tablist" aria-label="Main sections">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "catalog"}
              aria-controls="panel-catalog"
              id="tab-catalog"
              className={tab === "catalog" ? "active" : ""}
              onClick={() => setTab("catalog")}
            >
              Catalog
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "grid"}
              aria-controls="panel-grid"
              id="tab-grid"
              className={tab === "grid" ? "active" : ""}
              onClick={() => setTab("grid")}
            >
              Grid View
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "recommendations"}
              aria-controls="panel-recommendations"
              id="tab-recommendations"
              className={tab === "recommendations" ? "active" : ""}
              onClick={() => setTab("recommendations")}
            >
              Recommendations
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "gaps"}
              aria-controls="panel-gaps"
              id="tab-gaps"
              className={tab === "gaps" ? "active" : ""}
              onClick={() => setTab("gaps")}
            >
              Gaps
            </button>
          </nav>
        </aside>
        <main className="layout-main" role="main">
          {tab === "catalog" && (
            <div id="panel-catalog" role="tabpanel" aria-labelledby="tab-catalog">
              <BallCatalog />
            </div>
          )}
          {tab === "grid" && (
            <div id="panel-grid" role="tabpanel" aria-labelledby="tab-grid">
              <GridView />
            </div>
          )}
          {tab === "recommendations" && (
            <div id="panel-recommendations" role="tabpanel" aria-labelledby="tab-recommendations">
              <RecommendationsPanel />
            </div>
          )}
          {tab === "gaps" && (
            <div id="panel-gaps" role="tabpanel" aria-labelledby="tab-gaps">
              <GapsPanel />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
