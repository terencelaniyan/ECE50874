export interface PhaseRatios {
  skid: number;
  hook: number;
  roll: number;
}

export function computePhaseRatios(skidFt: number, hookFt: number): PhaseRatios {
  const totalLane = 60;
  const rollFt = Math.max(0, totalLane - skidFt - hookFt);

  // Avoid division by zero
  if (totalLane <= 0) return { skid: 1, hook: 1, roll: 1 };

  return {
    skid: Math.max(0.5, skidFt / 10),
    hook: Math.max(0.5, hookFt / 10),
    roll: Math.max(0.5, rollFt / 10),
  };
}
