export interface SimulationParams {
  rg: number;
  diff: number;
  speed: number;       // mph
  revRate: number;     // rpm
  launchAngle: number; // degrees
  board: number;       // board number (5-25)
  oilPattern: string;  // pattern name string
}

export interface TrajectoryResult {
  entryAngle: number;
  entryClass: "good" | "warn" | "bad";
  breakPt: string;
  skidFt: number;
  hookFt: number;
  rollFt: number;
  outcome: string;
  outcomeClass: "good" | "warn" | "bad";
  hookPotential: number;
  patternLength: number;
}

export interface TrajectoryPath {
  pathStr: string;
  result: TrajectoryResult;
}

function getPatternLength(oilPattern: string): number {
  if (oilPattern.includes("Badger")) return 52;
  if (oilPattern.includes("Cheetah")) return 33;
  if (oilPattern.includes("Chameleon")) return 41;
  if (oilPattern.includes("House")) return 38;
  return 40;
}

export function computeTrajectory(params: SimulationParams): TrajectoryResult {
  const { rg, diff, speed, revRate, board, oilPattern } = params;

  const patternLength = getPatternLength(oilPattern);

  const rgFactor = (rg - 2.45) * 5;
  const diffFactor = diff * 50;
  const revFactor = revRate / 200;
  const speedFactor = 17 / speed;

  const hookPotential = diffFactor * revFactor * speedFactor * 4;

  const hookAmtRaw = hookPotential * 2.5;
  const hookAmt = Math.min(hookAmtRaw, 45);

  const entryAngle = 2.0 + hookPotential * 0.4;
  const entryClass: "good" | "warn" | "bad" =
    entryAngle >= 4.5 ? "good" : entryAngle >= 3 ? "warn" : "bad";

  const breakPt = `Board ${Math.round(board - hookAmt / 3)}`;
  const skidFt = Math.round(patternLength + (speed - 17) + rgFactor * 2);
  const hookFt = Math.max(0, Math.round(60 - skidFt));
  const rollFt = Math.max(0, 60 - skidFt - hookFt);

  const outcome =
    entryAngle >= 4.5
      ? "\u2713 POCKET HIT"
      : entryAngle >= 3
        ? "\u26A0 LIGHT POCKET"
        : "\u2717 CROSSOVER";
  const outcomeClass: "good" | "warn" | "bad" =
    entryAngle >= 4.5 ? "good" : entryAngle >= 3 ? "warn" : "bad";

  return {
    entryAngle,
    entryClass,
    breakPt,
    skidFt,
    hookFt,
    rollFt,
    outcome,
    outcomeClass,
    hookPotential,
    patternLength,
  };
}

export function computeTrajectoryPath(
  params: SimulationParams,
  dimensions: { W: number; H: number; laneW: number; pad: number }
): TrajectoryPath {
  const { speed, launchAngle, board } = params;
  const { W, H, laneW, pad } = dimensions;
  const laneX = (W - laneW) / 2;

  const result = computeTrajectory(params);

  const rg = params.rg;
  const rgFactor = (rg - 2.45) * 5;

  const unitsPerFoot = (H - 2 * pad) / 60;
  const baseSkid = result.patternLength * unitsPerFoot;
  const skidLen = baseSkid * (1 + (speed - 17) * 0.02) * (1 + rgFactor * 0.05);

  const hookAmtRaw = result.hookPotential * 2.5;
  const hookAmt = Math.min(hookAmtRaw, 45);

  const boardX = laneX + (board / 39) * laneW;
  const startY = H - pad;
  const endX = boardX - hookAmt;
  const endY = pad + 10;

  const cp1x = boardX + Math.tan((launchAngle * Math.PI) / 180) * skidLen;
  const cp1y = startY - skidLen * 0.7;
  const cp2x = endX + (boardX - endX) * 0.1;
  const cp2y = endY + (startY - endY) * 0.2;

  const pathStr = `M${boardX},${startY} C${cp1x},${cp1y} ${cp2x},${cp2y} ${endX},${endY}`;

  return { pathStr, result };
}
