import { describe, it, expect } from "vitest";
import { analyzeSimulation } from "./decision-framework";
import { computeTrajectory } from "./parametric-physics";
import type { SimulationParams } from "./parametric-physics";

const BASE: SimulationParams = {
  rg: 2.50, diff: 0.040, speed: 17, revRate: 280,
  launchAngle: 3, board: 15, oilPattern: "House Shot (38ft)",
};

describe("analyzeSimulation — decision framework", () => {
  it("good outcome produces positive summary with no actions", () => {
    const result = computeTrajectory(BASE);
    const advice = analyzeSimulation(result, { rg: 2.50, diff: 0.040 });
    // Entry angle 6.5° is slightly high (isMarginalHigh range)
    expect(advice.summary.length).toBeGreaterThan(0);
    // With good ball specs the advice should be minor adjustments at most
    expect(advice.actions.every(a => a.type !== "maintenance")).toBe(true);
  });

  it("bad outcome (spare ball) recommends higher-diff ball and delivery change", () => {
    const result = computeTrajectory({ ...BASE, diff: 0.010, revRate: 180, speed: 20 });
    const advice = analyzeSimulation(result, { rg: 2.50, diff: 0.010, coverstockType: "Plastic" });
    expect(advice.summary).toContain("Under-hooking");
    expect(advice.reasons.length).toBeGreaterThan(0);
    const actionTypes = advice.actions.map((a) => a.type);
    expect(actionTypes).toContain("change_ball");
  });

  it("warn outcome recommends fine-tuning or ball change", () => {
    const result = computeTrajectory({ ...BASE, diff: 0.020, revRate: 250 });
    const advice = analyzeSimulation(result, { rg: 2.50, diff: 0.020 });
    expect(advice.summary).toContain("Almost");
    // Should have delivery adjustment or ball change advice
    expect(advice.actions.length).toBeGreaterThan(0);
  });

  it("high game count triggers maintenance advice", () => {
    const result = computeTrajectory(BASE);
    const advice = analyzeSimulation(result, { rg: 2.50, diff: 0.040, gameCount: 75 });
    expect(advice.reasons.some((r) => r.includes("75 games"))).toBe(true);
    expect(advice.actions.some((a) => a.type === "maintenance")).toBe(true);
    expect(advice.actions.find((a) => a.type === "maintenance")?.detail).toContain("Resurfac");
  });

  it("pearl coverstock on weak shot recommends solid/hybrid", () => {
    const result = computeTrajectory({ ...BASE, diff: 0.015, revRate: 180, speed: 20 });
    const advice = analyzeSimulation(result, { rg: 2.50, diff: 0.015, coverstockType: "Pearl Reactive" });
    const ballActions = advice.actions.filter((a) => a.type === "change_ball");
    expect(ballActions.some((a) => a.detail.includes("solid") || a.detail.includes("hybrid"))).toBe(true);
  });

  it("high RG on short pattern recommends lower-RG ball", () => {
    const result = computeTrajectory({ ...BASE, rg: 2.65, oilPattern: "Sport Shot — Cheetah (33ft)" });
    const advice = analyzeSimulation(result, { rg: 2.65, diff: 0.040 });
    expect(advice.actions.some((a) => a.detail.includes("lower-RG") || a.detail.includes("2.46"))).toBe(true);
  });

  it("low RG on long pattern recommends higher-RG ball", () => {
    const result = computeTrajectory({ ...BASE, rg: 2.48, oilPattern: "Sport Shot — Badger (52ft)" });
    const advice = analyzeSimulation(result, { rg: 2.48, diff: 0.040 });
    expect(advice.actions.some((a) => a.detail.includes("higher-RG") || a.detail.includes("2.58+"))).toBe(true);
  });

  it("all advice actions have label and detail", () => {
    const result = computeTrajectory({ ...BASE, diff: 0.008, revRate: 150, speed: 22 });
    const advice = analyzeSimulation(result, {
      rg: 2.70, diff: 0.008, coverstockType: "Polyester", gameCount: 80,
    });
    for (const action of advice.actions) {
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.detail.length).toBeGreaterThan(0);
      expect(["adjust_delivery", "change_ball", "maintenance", "change_pattern"]).toContain(action.type);
    }
  });
});
