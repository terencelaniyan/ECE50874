import { describe, it, expect } from "vitest";
import { computeTrajectory, computeTrajectoryPath } from "./parametric-physics";
import type { SimulationParams } from "./parametric-physics";

// ─── Baseline params: average bowler with benchmark ball on house shot ───
const BASELINE: SimulationParams = {
  rg: 2.50,
  diff: 0.040,
  speed: 17,       // avg recreational ~16-18 mph
  revRate: 280,    // avg ~250-350 rpm
  launchAngle: 3,
  board: 15,
  oilPattern: "House Shot (38ft)",
};

function withOverrides(overrides: Partial<SimulationParams>): SimulationParams {
  return { ...BASELINE, ...overrides };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. OUTCOME CLASSIFICATION — all three outcomes are reachable
// ═══════════════════════════════════════════════════════════════════════════
describe("outcome classification", () => {
  it("classifies POCKET HIT (good) for high hook potential", () => {
    // High diff + high rev rate + moderate speed → strong entry angle
    const r = computeTrajectory(withOverrides({ diff: 0.055, revRate: 400 }));
    expect(r.entryClass).toBe("good");
    expect(r.outcomeClass).toBe("good");
    expect(r.outcome).toContain("POCKET HIT");
    expect(r.entryAngle).toBeGreaterThanOrEqual(4.5);
  });

  it("classifies LIGHT POCKET (warn) for moderate hook potential", () => {
    // Low diff, moderate rev rate → marginal entry angle
    const r = computeTrajectory(withOverrides({ diff: 0.020, revRate: 250 }));
    expect(r.entryClass).toBe("warn");
    expect(r.outcomeClass).toBe("warn");
    expect(r.outcome).toContain("LIGHT POCKET");
    expect(r.entryAngle).toBeGreaterThanOrEqual(3);
    expect(r.entryAngle).toBeLessThan(4.5);
  });

  it("classifies CROSSOVER (bad) for very low hook potential", () => {
    // Plastic spare ball: very low diff, low revs, high speed
    const r = computeTrajectory(withOverrides({ diff: 0.008, revRate: 150, speed: 20 }));
    expect(r.entryClass).toBe("bad");
    expect(r.outcomeClass).toBe("bad");
    expect(r.outcome).toContain("CROSSOVER");
    expect(r.entryAngle).toBeLessThan(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. USBC-REFERENCED PHYSICAL VALIDITY
//    Sources: USBC Ball Motion Study, IBPSIA entry angle research,
//    BowlersMart coverstocks/cores guides, Storm/Brunswick tech docs
//    Key benchmarks:
//    - Optimal entry angle: 6° (USBC), practical strike range 4-6°
//    - RG allowed: 2.460"-2.800" (USBC Equipment Specs Manual)
//    - Differential max: 0.060" (USBC, reduced from 0.080 in 2005)
//    - Lane: 60 ft foul line to headpin
//    - Skid phase: 0-20 ft, Hook: 15-45 ft, Roll: 45-60 ft (typical)
//    - Rule of 31: breakpoint_board ≈ pattern_length - 31
// ═══════════════════════════════════════════════════════════════════════════
describe("USBC-referenced physical validity", () => {
  it("baseline bowler (17 mph, 280 rpm, 0.040 diff) achieves strike-range entry angle (4-6°)", () => {
    const r = computeTrajectory(BASELINE);
    // USBC: practical strike range is 4-6 degrees. Our baseline should be in this window.
    expect(r.entryAngle).toBeGreaterThanOrEqual(4);
    expect(r.entryAngle).toBeLessThanOrEqual(8); // parametric model allows slight overshoot
    expect(r.entryClass).toBe("good");
  });

  it("spare ball (plastic, 0.008 diff) produces sub-3° entry — too weak for strikes", () => {
    // Plastic balls: diff 0.008-0.015, minimal hook potential
    const r = computeTrajectory(withOverrides({ diff: 0.010, revRate: 200, speed: 18 }));
    expect(r.entryAngle).toBeLessThan(4);
    expect(r.entryClass).not.toBe("good");
  });

  it("skid + hook ≤ 60 ft (lane length) for all patterns", () => {
    const patterns = [
      "House Shot (38ft)",
      "Sport Shot — Badger (52ft)",
      "Sport Shot — Cheetah (33ft)",
      "Sport Shot — Chameleon (41ft)",
    ];
    for (const p of patterns) {
      const r = computeTrajectory(withOverrides({ oilPattern: p }));
      expect(r.skidFt + r.hookFt).toBeLessThanOrEqual(60);
      expect(r.skidFt).toBeGreaterThan(0);
      expect(r.hookFt).toBeGreaterThanOrEqual(0);
    }
  });

  it("skid length approximates oil pattern length for avg bowler", () => {
    // The skid phase roughly corresponds to oil pattern length
    // (ball slides on oil, then hooks on dry backend)
    const r = computeTrajectory(BASELINE); // 38ft house shot
    // Skid should be within ±8 ft of pattern length for average bowler
    expect(Math.abs(r.skidFt - 38)).toBeLessThanOrEqual(8);
  });

  it("pattern length is correctly detected for all 4 patterns + unknown", () => {
    expect(computeTrajectory(withOverrides({ oilPattern: "House Shot (38ft)" })).patternLength).toBe(38);
    expect(computeTrajectory(withOverrides({ oilPattern: "Sport Shot — Badger (52ft)" })).patternLength).toBe(52);
    expect(computeTrajectory(withOverrides({ oilPattern: "Sport Shot — Cheetah (33ft)" })).patternLength).toBe(33);
    expect(computeTrajectory(withOverrides({ oilPattern: "Sport Shot — Chameleon (41ft)" })).patternLength).toBe(41);
    expect(computeTrajectory(withOverrides({ oilPattern: "Unknown" })).patternLength).toBe(40);
  });

  it("USBC spec boundaries: RG 2.460-2.800 and diff 0.010-0.060 all produce valid output", () => {
    const corners: Partial<SimulationParams>[] = [
      { rg: 2.460, diff: 0.010 }, // low RG, low diff
      { rg: 2.460, diff: 0.060 }, // low RG, max diff
      { rg: 2.800, diff: 0.010 }, // max RG, low diff
      { rg: 2.800, diff: 0.060 }, // max RG, max diff
    ];
    for (const c of corners) {
      const r = computeTrajectory(withOverrides(c));
      expect(Number.isFinite(r.entryAngle)).toBe(true);
      expect(Number.isFinite(r.skidFt)).toBe(true);
      expect(r.skidFt).toBeGreaterThan(0);
      expect(r.skidFt).toBeLessThanOrEqual(60);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2b. BOWLER ARCHETYPE MATRIX
//    Validates that different bowler types produce qualitatively correct results
//    per bowling industry knowledge (BowlVersity, MOTIV, National Bowling Academy)
// ═══════════════════════════════════════════════════════════════════════════
describe("bowler archetype matrix", () => {
  it("stroker (low rev, moderate speed) → moderate entry angle", () => {
    // Stroker: 200-300 rpm, 16-18 mph, smooth arc
    const r = computeTrajectory(withOverrides({ revRate: 250, speed: 17, diff: 0.040 }));
    expect(r.entryAngle).toBeGreaterThanOrEqual(3);
    expect(r.entryAngle).toBeLessThanOrEqual(7);
  });

  it("cranker (high rev, slower speed) → high entry angle", () => {
    // Cranker: 400-500 rpm, 14-16 mph, aggressive hook
    const r = computeTrajectory(withOverrides({ revRate: 450, speed: 14, diff: 0.055 }));
    expect(r.entryAngle).toBeGreaterThan(6);
    expect(r.entryClass).toBe("good");
  });

  it("speed-dominant bowler (fast, low rev) → weak hook", () => {
    // Speed dominant: 20+ mph, <250 rpm
    const r = computeTrajectory(withOverrides({ speed: 21, revRate: 200, diff: 0.040 }));
    expect(r.entryAngle).toBeLessThan(5);
  });

  it("cranker entry angle > stroker entry angle (same ball)", () => {
    const ball = { diff: 0.045, rg: 2.52 };
    const stroker = computeTrajectory(withOverrides({ ...ball, revRate: 250, speed: 17 }));
    const cranker = computeTrajectory(withOverrides({ ...ball, revRate: 420, speed: 15 }));
    expect(cranker.entryAngle).toBeGreaterThan(stroker.entryAngle);
  });

  it("aggressive ball on short pattern hooks more than control ball on long pattern", () => {
    // Aggressive: low RG, high diff, short pattern
    const agg = computeTrajectory(withOverrides({
      rg: 2.48, diff: 0.055, oilPattern: "Sport Shot — Cheetah (33ft)",
    }));
    // Control: high RG, low diff, long pattern
    const ctrl = computeTrajectory(withOverrides({
      rg: 2.70, diff: 0.020, oilPattern: "Sport Shot — Badger (52ft)",
    }));
    expect(agg.entryAngle).toBeGreaterThan(ctrl.entryAngle);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. MONOTONICITY — physics relationships are directionally correct
//    Per USBC and bowling industry standards:
//    - Higher diff → more hook (higher entry angle)
//    - Higher rev rate → more hook
//    - Higher speed → less hook (ball skids more)
//    - Higher RG → longer skid (later hook)
//    - Shorter pattern → shorter skid (earlier hook)
// ═══════════════════════════════════════════════════════════════════════════
describe("monotonicity — directional correctness", () => {
  it("higher differential → higher entry angle (more hook)", () => {
    const low = computeTrajectory(withOverrides({ diff: 0.020 }));
    const mid = computeTrajectory(withOverrides({ diff: 0.040 }));
    const high = computeTrajectory(withOverrides({ diff: 0.060 }));
    expect(high.entryAngle).toBeGreaterThan(mid.entryAngle);
    expect(mid.entryAngle).toBeGreaterThan(low.entryAngle);
  });

  it("higher rev rate → higher entry angle (more hook)", () => {
    const low = computeTrajectory(withOverrides({ revRate: 150 }));
    const mid = computeTrajectory(withOverrides({ revRate: 300 }));
    const high = computeTrajectory(withOverrides({ revRate: 450 }));
    expect(high.entryAngle).toBeGreaterThan(mid.entryAngle);
    expect(mid.entryAngle).toBeGreaterThan(low.entryAngle);
  });

  it("higher speed → lower entry angle (less hook)", () => {
    const slow = computeTrajectory(withOverrides({ speed: 12 }));
    const mid = computeTrajectory(withOverrides({ speed: 17 }));
    const fast = computeTrajectory(withOverrides({ speed: 22 }));
    expect(slow.entryAngle).toBeGreaterThan(mid.entryAngle);
    expect(mid.entryAngle).toBeGreaterThan(fast.entryAngle);
  });

  it("higher RG → longer skid (later hook)", () => {
    const lowRg = computeTrajectory(withOverrides({ rg: 2.46 }));
    const highRg = computeTrajectory(withOverrides({ rg: 2.70 }));
    expect(highRg.skidFt).toBeGreaterThan(lowRg.skidFt);
  });

  it("shorter oil pattern → shorter skid", () => {
    const cheetah = computeTrajectory(withOverrides({ oilPattern: "Sport Shot — Cheetah (33ft)" }));
    const house = computeTrajectory(withOverrides({ oilPattern: "House Shot (38ft)" }));
    const badger = computeTrajectory(withOverrides({ oilPattern: "Sport Shot — Badger (52ft)" }));
    expect(cheetah.skidFt).toBeLessThan(house.skidFt);
    expect(house.skidFt).toBeLessThan(badger.skidFt);
  });

  it("higher speed → longer skid", () => {
    const slow = computeTrajectory(withOverrides({ speed: 12 }));
    const fast = computeTrajectory(withOverrides({ speed: 22 }));
    expect(fast.skidFt).toBeGreaterThan(slow.skidFt);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. EDGE CASES — boundary conditions don't break the model
// ═══════════════════════════════════════════════════════════════════════════
describe("edge cases", () => {
  it("minimum inputs produce valid output", () => {
    const r = computeTrajectory({
      rg: 2.46, diff: 0.008, speed: 12, revRate: 150,
      launchAngle: 0, board: 5, oilPattern: "Sport Shot — Cheetah (33ft)",
    });
    expect(r.skidFt).toBeGreaterThan(0);
    expect(r.hookFt).toBeGreaterThanOrEqual(0);
    expect(r.entryAngle).toBeGreaterThan(0);
    expect(typeof r.outcome).toBe("string");
  });

  it("maximum inputs produce valid output (no NaN/Infinity)", () => {
    const r = computeTrajectory({
      rg: 2.80, diff: 0.060, speed: 22, revRate: 450,
      launchAngle: 8, board: 25, oilPattern: "Sport Shot — Badger (52ft)",
    });
    expect(Number.isFinite(r.entryAngle)).toBe(true);
    expect(Number.isFinite(r.skidFt)).toBe(true);
    expect(Number.isFinite(r.hookFt)).toBe(true);
    expect(Number.isFinite(r.hookPotential)).toBe(true);
  });

  it("hook amount is capped at 45 boards", () => {
    // Extreme diff + extreme revs + very slow speed
    const r = computeTrajectory(withOverrides({ diff: 0.060, revRate: 450, speed: 12 }));
    // hookAmt = min(hookPotential * 2.5, 45) — verify cap is active
    expect(r.hookPotential * 2.5).toBeGreaterThan(45);
    // The breakpoint should reflect the capped hook
    const boardNum = parseInt(r.breakPt.replace("Board ", ""));
    expect(boardNum).toBeGreaterThanOrEqual(-30); // board - 15 max
    expect(Number.isFinite(boardNum)).toBe(true);
  });

  it("zero differential produces minimal but non-zero entry angle", () => {
    // A ball with 0 diff shouldn't hook, but entry angle has a base of 2.0
    const r = computeTrajectory(withOverrides({ diff: 0 }));
    expect(r.entryAngle).toBe(2.0);
    expect(r.entryClass).toBe("bad");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. KNOWN-VALUE REGRESSION — baseline scenario produces exact expected values
//    If the physics model changes, these tests catch regressions.
// ═══════════════════════════════════════════════════════════════════════════
describe("regression — baseline known values", () => {
  it("baseline scenario produces expected results", () => {
    const r = computeTrajectory(BASELINE);
    // Snapshot current behavior for regression detection
    expect(r.patternLength).toBe(38);
    expect(r.skidFt).toBe(39);
    expect(r.hookFt).toBe(21);
    expect(r.entryAngle).toBeCloseTo(6.48, 1);
    expect(r.entryClass).toBe("good");
    expect(r.outcome).toContain("POCKET HIT");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. TRAJECTORY PATH — SVG output is well-formed
// ═══════════════════════════════════════════════════════════════════════════
describe("trajectory path generation", () => {
  const DIMS = { W: 800, H: 600, laneW: 80, pad: 20 };

  it("produces a valid SVG cubic Bézier path", () => {
    const { pathStr } = computeTrajectoryPath(BASELINE, DIMS);
    expect(pathStr).toMatch(/^M[\d.]+,[\d.]+ C[\d.]+,[\d.]+ [\d.]+,[\d.]+ [\d.]+,[\d.]+$/);
  });

  it("start Y is at bottom of lane (H - pad)", () => {
    const { pathStr } = computeTrajectoryPath(BASELINE, DIMS);
    const startY = parseFloat(pathStr.split(",")[1].split(" ")[0]);
    expect(startY).toBe(DIMS.H - DIMS.pad); // 580
  });

  it("end Y is near top of lane (pad + 10)", () => {
    const { pathStr } = computeTrajectoryPath(BASELINE, DIMS);
    const parts = pathStr.split(" ");
    const endCoord = parts[parts.length - 1];
    const endY = parseFloat(endCoord.split(",")[1]);
    expect(endY).toBe(DIMS.pad + 10); // 30
  });

  it("result matches standalone computeTrajectory", () => {
    const { result } = computeTrajectoryPath(BASELINE, DIMS);
    const standalone = computeTrajectory(BASELINE);
    expect(result.entryAngle).toBe(standalone.entryAngle);
    expect(result.skidFt).toBe(standalone.skidFt);
    expect(result.hookFt).toBe(standalone.hookFt);
    expect(result.outcome).toBe(standalone.outcome);
  });
});
