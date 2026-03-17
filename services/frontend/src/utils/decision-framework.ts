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
 * Key improvements over naive approach:
 * - Different advice for "too much hook" vs "too little hook"
 * - Ball-specific recommendations based on RG/diff/coverstock
 * - Accounts for speed vs rev rate ratio (speed dominance vs rev dominance)
 * - Pattern-specific guidance
 * - Degradation-aware maintenance suggestions
 *
 * USBC benchmarks: optimal entry angle 6° (strike range 4-6°)
 */
export function analyzeSimulation(
  result: TrajectoryResult,
  ballSpecs: { rg: number; diff: number; coverstockType?: string | null; gameCount?: number },
): SimulationAdvice {
  const reasons: string[] = [];
  const actions: AdviceAction[] = [];

  const { entryAngle, skidFt, hookFt, patternLength } = result;
  const { rg, diff, coverstockType, gameCount } = ballSpecs;

  // Compute speed/rev balance indicator
  const isOverhooking = entryAngle > 7;
  const isUnderhooking = entryAngle < 3;
  const isMarginalLow = entryAngle >= 3 && entryAngle < 4.5;
  const isMarginalHigh = entryAngle > 6 && entryAngle <= 7;
  const isOptimal = entryAngle >= 4.5 && entryAngle <= 6;

  // ── Entry angle analysis ──
  if (isUnderhooking) {
    reasons.push(
      `Entry angle ${entryAngle.toFixed(1)}° is well below the 4-6° strike zone. The ball isn't hooking enough to reach the pocket.`
    );
  } else if (isMarginalLow) {
    reasons.push(
      `Entry angle ${entryAngle.toFixed(1)}° is in the marginal range — light pocket hits that leave corner pins.`
    );
  } else if (isOverhooking) {
    reasons.push(
      `Entry angle ${entryAngle.toFixed(1)}° is too steep — the ball is over-hooking and crossing over to the Brooklyn side.`
    );
  } else if (isMarginalHigh) {
    reasons.push(
      `Entry angle ${entryAngle.toFixed(1)}° is slightly high — you're at the upper limit of the pocket. Splits become more likely.`
    );
  }

  // ── Skid vs pattern analysis ──
  const skidDelta = skidFt - patternLength;
  if (skidDelta > 5) {
    reasons.push(
      `Skid ${skidFt} ft exceeds oil pattern (${patternLength} ft) by ${skidDelta} ft — the ball pushes through the oil, suggesting too much speed or too high an RG for this pattern.`
    );
  } else if (skidDelta < -8) {
    reasons.push(
      `Skid ${skidFt} ft is well short of the oil pattern (${patternLength} ft) — the ball hooks too early, using up energy in the oil zone.`
    );
  }

  // ── Hook distance analysis ──
  if (hookFt < 6 && !isOverhooking) {
    reasons.push(`Hook distance only ${hookFt} ft — the ball may "roll out" before the pins.`);
  } else if (hookFt > 25) {
    reasons.push(`Hook distance ${hookFt} ft is excessive — the ball is still curving at the pins, causing erratic pin action.`);
  }

  // ── Degradation check ──
  if (gameCount && gameCount > 60) {
    reasons.push(
      `This ball has ${gameCount} games — coverstock is significantly worn. Hook potential is reduced from factory specs.`
    );
    actions.push({
      type: "maintenance",
      label: "Resurface coverstock",
      detail: `${gameCount} games of wear. Resurfacing with a 2000-grit Abralon pad can restore 80-90% of original hook potential. Consider a full rejuvenation if oil-soaked.`,
    });
  }

  // ── SPECIFIC actionable recommendations ──

  if (isUnderhooking) {
    // Not enough hook — diagnose WHY
    if (diff < 0.030) {
      actions.push({
        type: "change_ball",
        label: "Switch to higher-differential ball",
        detail: `Current differential ${diff.toFixed(3)}" is low. A ball with 0.045"+ differential (strong asymmetric) will generate significantly more hook. Check the Catalog for options.`,
      });
    }
    if (rg > 2.58 && patternLength < 42) {
      actions.push({
        type: "change_ball",
        label: "Use lower-RG ball for this pattern",
        detail: `RG ${rg.toFixed(2)}" is high for a ${patternLength} ft pattern. A ball with RG 2.46-2.52" will rev up sooner and generate more backend motion.`,
      });
    }
    if (coverstockType && /pearl|plastic|polyester/i.test(coverstockType)) {
      actions.push({
        type: "change_ball",
        label: "Switch to solid or hybrid reactive",
        detail: `${coverstockType} coverstocks are designed for length, not grip. A solid reactive ball will read the lane earlier and produce more hook on this pattern.`,
      });
    }
    // Only suggest delivery change if ball specs are reasonable
    if (diff >= 0.030 && rg <= 2.58) {
      actions.push({
        type: "adjust_delivery",
        label: "Slow down by 1-2 mph",
        detail: `Your ball specs are adequate — the issue may be too much ball speed. Slowing down allows the ball more time to grip the lane and generate hook.`,
      });
    }
  } else if (isOverhooking) {
    // Too much hook — different set of advice
    if (diff > 0.050) {
      actions.push({
        type: "change_ball",
        label: "Use a lower-differential ball",
        detail: `Differential ${diff.toFixed(3)}" is aggressive for this shot. A ball with 0.030-0.040" differential (benchmark or control) will be more controllable.`,
      });
    }
    if (rg < 2.52 && patternLength > 40) {
      actions.push({
        type: "change_ball",
        label: "Use higher-RG ball for more length",
        detail: `Low RG ${rg.toFixed(2)}" causes the ball to hook too early on this ${patternLength} ft pattern. A higher-RG ball (2.55-2.65") pushes through the oil better.`,
      });
    }
    if (coverstockType && /solid/i.test(coverstockType)) {
      actions.push({
        type: "change_ball",
        label: "Switch to pearl or hybrid reactive",
        detail: `Solid coverstocks grip too aggressively here. A pearl reactive will give more length through the oil and a cleaner backend reaction.`,
      });
    }
    if (actions.length === 0 || diff <= 0.050) {
      actions.push({
        type: "adjust_delivery",
        label: "Increase ball speed by 1-2 mph",
        detail: `More speed pushes the ball further down the lane before hooking, reducing the entry angle. Try moving your feet up on the approach.`,
      });
    }
  } else if (isMarginalLow) {
    // Close to strike range but not quite
    actions.push({
      type: "adjust_delivery",
      label: "Move 1-2 boards left and target further right",
      detail: `A small angle change can add 0.5-1° of entry angle. Moving your feet left while keeping the same target creates a wider entry angle.`,
    });
    if (patternLength <= 38 && rg > 2.56) {
      actions.push({
        type: "change_ball",
        label: "Consider a more aggressive ball",
        detail: `On this ${patternLength} ft pattern, your RG ${rg.toFixed(2)}" is pushing through the oil. A ball with more surface (sanded solid) may get to the pocket better.`,
      });
    }
  } else if (isMarginalHigh) {
    // Slightly too much — fine-tune
    actions.push({
      type: "adjust_delivery",
      label: "Move 1-2 boards right or add 0.5 mph",
      detail: `Small adjustment to reduce entry angle by 0.5-1°. Moving right reduces the angle; more speed carries the ball further before hooking.`,
    });
  }

  // ── Pattern-specific advice (only if not already covered above) ──
  if (patternLength >= 48 && rg < 2.52 && !isOverhooking && actions.every(a => a.type !== "change_ball")) {
    actions.push({
      type: "change_ball",
      label: "Use a length-oriented ball for this long pattern",
      detail: `${patternLength} ft patterns demand balls that can push through heavy oil. Higher RG (2.58+), pearl reactive, and polished surface are ideal.`,
    });
  }
  if (patternLength <= 35 && rg > 2.62 && !isUnderhooking && actions.every(a => a.type !== "change_ball")) {
    actions.push({
      type: "change_ball",
      label: "Use a strong ball for this short pattern",
      detail: `Short ${patternLength} ft patterns reward early-rolling balls. Lower RG (2.46-2.52"), solid reactive, sanded surface.`,
    });
  }

  // ── Generate summary ──
  let summary: string;
  if (isOptimal && reasons.length === 0) {
    summary = `Excellent shot! ${entryAngle.toFixed(1)}° entry angle is right in the USBC strike zone. Skid ${skidFt} ft / Hook ${hookFt} ft is well-matched to this ${patternLength} ft pattern.`;
  } else if (isOptimal) {
    summary = `Good entry angle (${entryAngle.toFixed(1)}°) but some aspects could be improved.`;
  } else if (isOverhooking) {
    summary = `Over-hooking — ${entryAngle.toFixed(1)}° entry angle is too steep. Reduce hook or increase speed.`;
  } else if (isUnderhooking) {
    summary = `Under-hooking — ${entryAngle.toFixed(1)}° entry angle is below strike range. More hook or ball change needed.`;
  } else if (isMarginalLow) {
    summary = `Almost there — ${entryAngle.toFixed(1)}° is close to the 4.5° threshold. Small adjustment can make it a strike.`;
  } else {
    summary = `Marginal result — ${entryAngle.toFixed(1)}° entry angle. Fine-tuning recommended.`;
  }

  return { summary, reasons, actions };
}
