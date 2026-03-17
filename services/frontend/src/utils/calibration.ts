/**
 * Pixel-to-real-world calibration using bowler height as reference scale.
 *
 * Uses the distance from nose to ankle in normalized landmark space to
 * estimate a pixels-per-foot conversion factor.
 */
import type { Landmark, CalibrationConfig } from "../types/analysis";
import { POSE_LANDMARKS } from "../constants/baselines";

const DEFAULT_CONFIG: CalibrationConfig = {
  bowlerHeightFeet: 5.83,        // 5'10" — US male average
  shoulderToAnkleRatio: 0.82,    // shoulder-to-ankle ≈ 82% of total height
  fps: 30,
};

/** Euclidean distance between two landmarks in normalized space. */
function landmarkDist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Estimate the conversion factor: how many normalized units equal one foot.
 * Uses the shoulder midpoint to ankle midpoint as reference length.
 */
export function estimateScale(
  landmarks: Landmark[],
  config: Partial<CalibrationConfig> = {},
): number {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const lShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const lAnkle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];
  const rAnkle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

  if (!lShoulder || !rShoulder || !lAnkle || !rAnkle) return 0;

  const shoulderMid: Landmark = {
    x: (lShoulder.x + rShoulder.x) / 2,
    y: (lShoulder.y + rShoulder.y) / 2,
    z: (lShoulder.z + rShoulder.z) / 2,
    visibility: Math.min(lShoulder.visibility, rShoulder.visibility),
  };
  const ankleMid: Landmark = {
    x: (lAnkle.x + rAnkle.x) / 2,
    y: (lAnkle.y + rAnkle.y) / 2,
    z: (lAnkle.z + rAnkle.z) / 2,
    visibility: Math.min(lAnkle.visibility, rAnkle.visibility),
  };

  const shoulderToAnkleNorm = landmarkDist(shoulderMid, ankleMid);
  if (shoulderToAnkleNorm < 0.01) return 0;

  const realFeet = cfg.bowlerHeightFeet * cfg.shoulderToAnkleRatio;
  return shoulderToAnkleNorm / realFeet; // normalized units per foot
}

/**
 * Convert a normalized displacement to feet using the scale factor.
 */
export function pixelToFeet(normalizedDist: number, scale: number): number {
  if (scale <= 0) return 0;
  return normalizedDist / scale;
}

/**
 * Convert feet-per-frame to mph.
 */
export function feetPerFrameToMph(feetPerFrame: number, fps: number): number {
  return (feetPerFrame * fps * 3600) / 5280;
}

export { DEFAULT_CONFIG };
