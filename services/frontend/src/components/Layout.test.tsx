import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Layout } from "./Layout";
import * as api from "../api/balls";

// Mock child components to keep the test isolated
vi.mock("./BallCatalog", () => ({ BallCatalog: () => <div data-testid="ball-catalog" /> }));
vi.mock("./RecommendationsPanel", () => ({ RecommendationsPanel: () => <div data-testid="recs-panel" /> }));
vi.mock("./GapsPanel", () => ({ GapsPanel: () => <div data-testid="gaps-panel" /> }));
vi.mock("./GridView", () => ({ GridView: () => <div data-testid="grid-view" /> }));
vi.mock("./ArsenalPanel", () => ({ ArsenalPanel: () => <div data-testid="arsenal-panel" /> }));
vi.mock("./RecommendationsListCompact", () => ({ RecommendationsListCompact: () => <div data-testid="recs-list-compact" /> }));
vi.mock("./BallDatabaseView", () => ({ BallDatabaseView: () => <div data-testid="db-view" /> }));
vi.mock("./SimulationView", () => ({ SimulationView: () => <div data-testid="sim-view" /> }));
vi.mock("./SlotAssignmentPanel", () => ({ SlotAssignmentPanel: () => <div data-testid="slot-panel" /> }));
vi.mock("./AnalysisView", () => ({ AnalysisView: () => <div data-testid="analysis-view" /> }));
vi.mock("./SimulationView3D", () => ({ SimulationView3D: () => <div data-testid="sim-3d-view" /> }));

// Mock generic BagContext wrapper if needed by Layout directly (usually not)
vi.mock("../context/BagContext", () => ({
  useBag: () => ({ activeArsenalId: null }),
}));

// Mock the api call taking place in useEffect
vi.mock("../api/balls", () => ({
  listBalls: vi.fn(),
}));

describe("Layout Component", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders GridView initially and calls listBalls for badging", async () => {
    vi.mocked(api.listBalls).mockResolvedValueOnce({ items: [], count: 42 });

    render(<Layout />);

    // Check header
    expect(screen.getByText("BBG")).toBeInTheDocument();
    
    // Check default view
    expect(screen.getByTestId("grid-view")).toBeInTheDocument();
    expect(screen.queryByTestId("ball-catalog")).not.toBeInTheDocument();

    // Check right panel default
    expect(screen.getByTestId("recs-list-compact")).toBeInTheDocument();

    // Check that badge updates
    await waitFor(() => {
      expect(screen.getByText("DB: 42 BALLS LOADED")).toBeInTheDocument();
    });
  });

  it("switches tabs correctly", () => {
    vi.mocked(api.listBalls).mockResolvedValueOnce({ items: [], count: 10 });
    render(<Layout />);

    // Click Catalog
    const catalogTab = screen.getByRole("tab", { name: "Catalog" });
    fireEvent.click(catalogTab);

    expect(screen.getByTestId("ball-catalog")).toBeInTheDocument();
    expect(screen.queryByTestId("grid-view")).not.toBeInTheDocument();
    
    // Check that the tab has 'active' class
    expect(catalogTab).toHaveClass("active");

    // Click Analysis
    fireEvent.click(screen.getByRole("tab", { name: "Analysis" }));
    expect(screen.getByTestId("analysis-view")).toBeInTheDocument();
  });

  it("switches right panels in Grid view", () => {
    vi.mocked(api.listBalls).mockResolvedValueOnce({ items: [], count: 10 });
    render(<Layout />);

    const slotsBtn = screen.getByRole("button", { name: "Slots" });
    fireEvent.click(slotsBtn);

    expect(screen.getByTestId("slot-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("recs-list-compact")).not.toBeInTheDocument();

    const recsBtn = screen.getByRole("button", { name: "Recs" });
    fireEvent.click(recsBtn);
    expect(screen.getByTestId("recs-list-compact")).toBeInTheDocument();
  });
});
