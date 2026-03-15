import type { TrajectoryResult } from "./parametric-physics";

export interface SimulationAdvice {
  summary: string;
  reasons: string[];
  actions: AdviceAction[];
}

export interface AdviceAction {
  type: "adjust_delivery" | "change_ball" | "maintenance" | "change_pattern";
  label: string;
  detail: string;
}

/**
 * Decision Framework: analyzes simulation results and produces actionable advice.
 *
 * Per the proposal: "poor simulation outcomes trigger the Strategy Engine to
 * explain *why* a ball is underperforming and recommend either maintenance
 * or a replacement."
 *
 * Uses USBC benchmarks:
 * - Optimal entry angle: 6° (practical strike range 4-6°)
 * - Skid should approximate oil pattern length ± 5ft
 * - Hook phase should be 10-25 ft for controlled motion
 *
 * References: USBC Ball Motion Study, IBPSIA entry angle research,
 * BowlersMart core/coverstock guides, Rule of 31
 */
export function analyzeSimulation(
  result: TrajectoryResult,
  ballSpecs: { rg: number; diff: number; coverstockType?: string | null; gameCount?: number },
): SimulationAdvice {
  const reasons: string[] = [];
  const actions: AdviceAction[] = [];

  const { entryAngle, entryClass, skidFt, hookFt, patternLength } = result;
  const { rg, diff, coverstockType, gameCount } = ballSpecs;

  // ── Entry angle analysis ──
  if (entryClass === "bad") {
    reasons.push(
      `Entry angle is ${entryAngle.toFixed(1)}° — well below the 4-6° strike zone (USBC optimal: 6°). The ball lacks hook to reach the pocket.`
    );
  } else if (entryClass === "warn") {
    reasons.push(
      `Entry angle is ${entryAngle.toFixed(1)}° — in the marginal 3-4.5° range. Light pocket hits are likely, leaving corner pins.`
    );
  }

  // ── Skid analysis vs pattern length ──
  const skidDelta = skidFt - patternLength;
  if (skidDelta > 5) {
    reasons.push(
      `Skid length (${skidFt} ft) exceeds oil pattern (${patternLength} ft) by ${skidDelta} ft. The ball is pushing through the oil without gripping — it may be speed-dominant or the RG is too high for this pattern.`
    );
  } else if (skidDelta < -5) {
    reasons.push(
      `Skid length (${skidFt} ft) is ${-skidDelta} ft shorter than the oil pattern (${patternLength} ft). The ball is hooking too early in the oil, losing energy before the backend.`
    );
  }

  // ── Hook distance analysis ──
  if (hookFt < 8) {
    reasons.push(
      `Hook distance is only ${hookFt} ft — very short. The ball enters roll phase too early and may "roll out" before reaching the pins.`
    );
  } else if (hookFt > 30) {
    reasons.push(
      `Hook distance is ${hookFt} ft — unusually long. The ball may still be hooking at the pins, causing unpredictable pin action.`
    );
  }

  // ── Degradation check ──
  if (gameCount && gameCount > 60) {
    reasons.push(
      `This ball has ${gameCount} games — coverstock performance has degraded significantly. Effective RG/differential are reduced from factory specs.`
    );
    actions.push({
      type: "maintenance",
      label: "Resurface coverstock",
      detail: `With ${gameCount} games, the coverstock has absorbed oil and lost texture. Resurfacing (e.g., 2000-grit Abralon pad) can restore 80-90% of original hook potential.`,
    });
  } else if (gameCount && gameCount > 30) {
    reasons.push(
      `This ball has ${gameCount} games — moderate wear may be affecting performance.`
    );
  }

  // ── Actionable recommendations based on outcome ──
  if (entryClass === "bad") {
    // Ball doesn't hook enough
    if (diff < 0.030) {
      actions.push({
        type: "change_ball",
        label: "Use higher-differential ball",
        detail: `Current ball has ${diff.toFixed(3)}" differential — low hook potential. Consider a ball with 0.045"+ differential for this pattern. Check Recommendations (V2) for suggestions.`,
      });
    }
    if (rg > 2.58) {
      actions.push({
        type: "change_ball",
        label: "Use lower-RG ball",
        detail: `RG ${rg.toFixed(3)}" is high — the ball skids too long before hooking. A lower-RG ball (2.46-2.54") will hook earlier and more aggressively.`,
      });
    }
    if (coverstockType && /pearl|plastic|polyester/i.test(coverstockType)) {
      actions.push({
        type: "change_ball",
        label: "Switch to solid/hybrid reactive",
        detail: `${coverstockType} coverstocks generate less friction. A solid or hybrid reactive coverstock will grip the lane earlier and produce more hook.`,
      });
    }
    actions.push({
      type: "adjust_delivery",
      label: "Increase rev rate or slow down",
      detail: "More axis rotation and/or slower speed increases hook potential. Try 1-2 mph slower or adjusting your wrist position for more revs.",
    });
  } else if (entryClass === "warn") {
    // Marginal — small adjustments may help
    actions.push({
      type: "adjust_delivery",
      label: "Fine-tune speed or revs",
      detail: `Entry angle (${entryAngle.toFixed(1)}°) is close to the 4.5° strike threshold. Try 0.5-1 mph slower or moving 1-2 boards left to increase entry angle.`,
    });
    if (patternLength <= 35) {
      actions.push({
        type: "change_ball",
        label: "Consider a stronger coverstock",
        detail: `On this short pattern (${patternLength} ft), a stronger coverstock (solid reactive, sanded surface) can help the ball read the lane earlier.`,
      });
    }
  }

  // ── Pattern-specific advice ──
  if (patternLength >= 45 && rg < 2.54) {
    actions.push({
      type: "change_ball",
      label: "Use a higher-RG ball for long patterns",
      detail: `On ${patternLength} ft patterns, a ball with RG 2.58+ provides more length through the oil before hooking on the backend.`,
    });
  }
  if (patternLength <= 35 && rg > 2.60) {
    actions.push({
      type: "change_ball",
      label: "Use a lower-RG ball for short patterns",
      detail: `On ${patternLength} ft patterns, a ball with RG 2.46-2.54" hooks earlier and is more controllable on the short oil.`,
    });
  }

  // ── Generate summary ──
  let summary: string;
  if (entryClass === "good" && reasons.length === 0) {
    summary = `Good shot — ${entryAngle.toFixed(1)}° entry angle is in the USBC strike zone (4-6°). Skid ${skidFt} ft / Hook ${hookFt} ft looks balanced for this ${patternLength} ft pattern.`;
  } else if (entryClass === "good") {
    summary = `Strike-range entry angle (${entryAngle.toFixed(1)}°), but some concerns were noted.`;
  } else if (entryClass === "warn") {
    summary = `Marginal result — ${entryAngle.toFixed(1)}° entry angle may leave pins. Adjustments recommended.`;
  } else {
    summary = `Poor result — ${entryAngle.toFixed(1)}° entry angle is below strike range. Ball or delivery changes needed.`;
  }

  return { summary, reasons, actions };
}
