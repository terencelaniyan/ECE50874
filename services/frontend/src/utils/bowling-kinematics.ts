/**
 * Pure functions for extracting bowling delivery kinematics from pose data.
 *
 * All functions are stateless and operate on FramePose arrays.
 * No MediaPipe dependency — just math on landmark coordinates.
 */
import type {
  FramePose,
  Landmark,
  BowlingKinematics,
  FormCheckpoint,
  FormEvaluation,
  CalibrationConfig,
} from "../types/analysis";
import { POSE_LANDMARKS, FORM_THRESHOLDS } from "../constants/baselines";
import { estimateScale, pixelToFeet, feetPerFrameToMph, DEFAULT_CONFIG } from "./calibration";

// ── Helpers ─────────────────────────────────────────────────────────────

function dist2d(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function angleBetween(a: Landmark, vertex: Landmark, c: Landmark): number {
  const v1x = a.x - vertex.x;
  const v1y = a.y - vertex.y;
  const v2x = c.x - vertex.x;
  const v2y = c.y - vertex.y;
  const dot = v1x * v2x + v1y * v2y;
  const cross = v1x * v2y - v1y * v2x;
  return Math.abs(Math.atan2(cross, dot) * (180 / Math.PI));
}

/** 3-frame moving average of wrist speed (normalized units per frame). */
function wristSpeeds(poses: FramePose[], wristIdx: number): number[] {
  const speeds: number[] = [0];
  for (let i = 1; i < poses.length; i++) {
    const prev = poses[i - 1].landmarks[wristIdx];
    const curr = poses[i].landmarks[wristIdx];
    if (!prev || !curr) { speeds.push(0); continue; }
    speeds.push(dist2d(prev, curr));
  }
  // 3-frame moving average
  const smoothed: number[] = [];
  for (let i = 0; i < speeds.length; i++) {
    const window = speeds.slice(Math.max(0, i - 1), i + 2);
    smoothed.push(window.reduce((a, b) => a + b, 0) / window.length);
  }
  return smoothed;
}

/** Determine which hand is the bowling hand (lower wrist at start of approach). */
export function detectBowlingHand(poses: FramePose[]): "left" | "right" {
  if (poses.length === 0) return "right";
  // Check first few frames: the bowling hand wrist tends to be lower (higher y)
  const sample = poses.slice(0, Math.min(10, poses.length));
  let leftLower = 0;
  for (const p of sample) {
    const lw = p.landmarks[POSE_LANDMARKS.LEFT_WRIST];
    const rw = p.landmarks[POSE_LANDMARKS.RIGHT_WRIST];
    if (lw && rw && lw.y > rw.y) leftLower++;
  }
  return leftLower > sample.length / 2 ? "left" : "right";
}

// ── Release Detection ───────────────────────────────────────────────────

/**
 * Detect the release frame as the peak wrist velocity.
 * Uses 3-frame smoothed velocity to reduce noise.
 * Returns -1 if no valid release found.
 */
export function detectReleaseFrame(poses: FramePose[]): number {
  if (poses.length < 5) return -1;

  const hand = detectBowlingHand(poses);
  const wristIdx = hand === "left"
    ? POSE_LANDMARKS.LEFT_WRIST
    : POSE_LANDMARKS.RIGHT_WRIST;

  const speeds = wristSpeeds(poses, wristIdx);

  // Find the global max in the second half of the video (approach + release)
  const searchStart = Math.floor(poses.length * 0.3);
  let maxSpeed = 0;
  let maxIdx = -1;
  for (let i = searchStart; i < speeds.length; i++) {
    if (speeds[i] > maxSpeed) {
      maxSpeed = speeds[i];
      maxIdx = i;
    }
  }

  // Validate: the peak should be significantly above the median
  const sorted = [...speeds].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (maxSpeed < median * 1.5) return -1;

  return maxIdx;
}

// ── Ball Speed ──────────────────────────────────────────────────────────

/**
 * Compute ball speed in mph at release using wrist displacement.
 * Averages velocity over a 3-frame window centered on the release.
 */
export function computeBallSpeed(
  poses: FramePose[],
  releaseIdx: number,
  config: Partial<CalibrationConfig> = {},
): number {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (releaseIdx < 1 || releaseIdx >= poses.length) return 0;

  const hand = detectBowlingHand(poses);
  const wristIdx = hand === "left"
    ? POSE_LANDMARKS.LEFT_WRIST
    : POSE_LANDMARKS.RIGHT_WRIST;

  // Calibrate scale from the release frame
  const scale = estimateScale(poses[releaseIdx].landmarks, cfg);
  if (scale <= 0) return 0;

  // Average wrist displacement over 3 frames around release
  const start = Math.max(0, releaseIdx - 1);
  const end = Math.min(poses.length - 1, releaseIdx + 1);
  let totalDist = 0;
  let count = 0;
  for (let i = start; i < end; i++) {
    const curr = poses[i].landmarks[wristIdx];
    const next = poses[i + 1].landmarks[wristIdx];
    if (curr && next) {
      totalDist += pixelToFeet(dist2d(curr, next), scale);
      count++;
    }
  }
  if (count === 0) return 0;

  const feetPerFrame = totalDist / count;
  return feetPerFrameToMph(feetPerFrame, cfg.fps);
}

// ── Launch Angle ────────────────────────────────────────────────────────

/**
 * Compute launch angle in degrees at release.
 * Angle between the wrist-elbow vector and the vertical axis.
 */
export function computeLaunchAngle(
  poses: FramePose[],
  releaseIdx: number,
): number {
  if (releaseIdx < 0 || releaseIdx >= poses.length) return 0;

  const hand = detectBowlingHand(poses);
  const wristIdx = hand === "left"
    ? POSE_LANDMARKS.LEFT_WRIST
    : POSE_LANDMARKS.RIGHT_WRIST;
  const elbowIdx = hand === "left"
    ? POSE_LANDMARKS.LEFT_ELBOW
    : POSE_LANDMARKS.RIGHT_ELBOW;

  const wrist = poses[releaseIdx].landmarks[wristIdx];
  const elbow = poses[releaseIdx].landmarks[elbowIdx];
  if (!wrist || !elbow) return 0;

  // Angle of wrist-elbow vector from vertical (lateral deviation)
  const dx = wrist.x - elbow.x;
  const dy = wrist.y - elbow.y;
  const angleRad = Math.atan2(Math.abs(dx), Math.abs(dy));
  return angleRad * (180 / Math.PI);
}

// ── Rev Rate Proxy ──────────────────────────────────────────────────────

/**
 * Estimate rev rate from forearm angular velocity around release.
 * This is a PROXY — true rev rate requires ball-mounted sensors.
 *
 * Method: measure angular change of wrist relative to elbow over
 * a 5-frame window centered on release, convert to RPM.
 */
export function computeRevRateProxy(
  poses: FramePose[],
  releaseIdx: number,
  fps: number = 30,
): number {
  if (releaseIdx < 2 || releaseIdx >= poses.length - 2) return 0;

  const hand = detectBowlingHand(poses);
  const wristIdx = hand === "left"
    ? POSE_LANDMARKS.LEFT_WRIST
    : POSE_LANDMARKS.RIGHT_WRIST;
  const elbowIdx = hand === "left"
    ? POSE_LANDMARKS.LEFT_ELBOW
    : POSE_LANDMARKS.RIGHT_ELBOW;

  const start = Math.max(0, releaseIdx - 2);
  const end = Math.min(poses.length - 1, releaseIdx + 2);

  let totalAngularChange = 0;
  let frameCount = 0;

  for (let i = start; i < end; i++) {
    const wA = poses[i].landmarks[wristIdx];
    const eA = poses[i].landmarks[elbowIdx];
    const wB = poses[i + 1].landmarks[wristIdx];
    const eB = poses[i + 1].landmarks[elbowIdx];
    if (!wA || !eA || !wB || !eB) continue;

    const angleA = Math.atan2(wA.x - eA.x, eA.y - wA.y);
    const angleB = Math.atan2(wB.x - eB.x, eB.y - wB.y);
    totalAngularChange += Math.abs(angleB - angleA);
    frameCount++;
  }

  if (frameCount === 0) return 0;

  const avgRadPerFrame = totalAngularChange / frameCount;
  const radPerSecond = avgRadPerFrame * fps;
  // Convert rad/s to RPM (1 rev = 2π rad, 60 s/min)
  // Scale factor: forearm rotation is ~30-40% of actual ball rev
  const forearmToRevScale = 2.8;
  return (radPerSecond / (2 * Math.PI)) * 60 * forearmToRevScale;
}

// ── Full Extraction ─────────────────────────────────────────────────────

/**
 * Extract all bowling kinematics from a sequence of frame poses.
 */
export function extractKinematics(
  poses: FramePose[],
  config: Partial<CalibrationConfig> = {},
): BowlingKinematics | null {
  const releaseIdx = detectReleaseFrame(poses);
  if (releaseIdx < 0) return null;

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const speed = computeBallSpeed(poses, releaseIdx, cfg);
  const angle = computeLaunchAngle(poses, releaseIdx);
  const revRate = computeRevRateProxy(poses, releaseIdx, cfg.fps);

  // Confidence based on landmark visibility at release
  const releasePose = poses[releaseIdx];
  const hand = detectBowlingHand(poses);
  const keyIndices = hand === "left"
    ? [POSE_LANDMARKS.LEFT_WRIST, POSE_LANDMARKS.LEFT_ELBOW, POSE_LANDMARKS.LEFT_SHOULDER]
    : [POSE_LANDMARKS.RIGHT_WRIST, POSE_LANDMARKS.RIGHT_ELBOW, POSE_LANDMARKS.RIGHT_SHOULDER];
  const avgVis = keyIndices.reduce(
    (sum, idx) => sum + (releasePose.landmarks[idx]?.visibility ?? 0),
    0,
  ) / keyIndices.length;

  return {
    ballSpeedMph: Math.round(speed * 10) / 10,
    launchAngleDeg: Math.round(angle * 10) / 10,
    revRateRpm: Math.round(revRate),
    releaseFrameIndex: releaseIdx,
    releaseTimestampMs: releasePose.timestampMs,
    confidence: Math.round(avgVis * 100) / 100,
  };
}

// ── Form Evaluation ─────────────────────────────────────────────────────

/**
 * Evaluate bowling form at release based on body pose.
 */
export function evaluateForm(
  poses: FramePose[],
  releaseIdx: number,
): FormEvaluation {
  const checkpoints: FormCheckpoint[] = [];

  if (releaseIdx < 0 || releaseIdx >= poses.length) {
    return { checkpoints: [], overallScore: 0 };
  }

  const hand = detectBowlingHand(poses);
  const p = poses[releaseIdx].landmarks;

  const shoulderIdx = hand === "left" ? POSE_LANDMARKS.LEFT_SHOULDER : POSE_LANDMARKS.RIGHT_SHOULDER;
  const wristIdx = hand === "left" ? POSE_LANDMARKS.LEFT_WRIST : POSE_LANDMARKS.RIGHT_WRIST;
  const hipIdx = hand === "left" ? POSE_LANDMARKS.LEFT_HIP : POSE_LANDMARKS.RIGHT_HIP;
  const kneeIdx = hand === "left" ? POSE_LANDMARKS.LEFT_KNEE : POSE_LANDMARKS.RIGHT_KNEE;
  const ankleIdx = hand === "left" ? POSE_LANDMARKS.LEFT_ANKLE : POSE_LANDMARKS.RIGHT_ANKLE;

  // 1. Arm verticality at release
  const shoulder = p[shoulderIdx];
  const wrist = p[wristIdx];
  if (shoulder && wrist) {
    const dx = Math.abs(wrist.x - shoulder.x);
    const dy = Math.abs(wrist.y - shoulder.y);
    const armAngle = Math.atan2(dx, dy) * (180 / Math.PI);
    const passed = armAngle <= FORM_THRESHOLDS.armVerticalityMaxDeg;
    checkpoints.push({
      name: "Arm Verticality",
      passed,
      detail: passed
        ? `Arm within ${Math.round(armAngle)}° of vertical — good pendulum swing`
        : `Arm at ${Math.round(armAngle)}° from vertical — try to keep arm closer to body`,
    });
  }

  // 2. Knee bend at release
  const hip = p[hipIdx];
  const knee = p[kneeIdx];
  const ankle = p[ankleIdx];
  if (hip && knee && ankle) {
    const kneeBend = angleBetween(hip, knee, ankle);
    const passed =
      kneeBend >= FORM_THRESHOLDS.kneeBendMin &&
      kneeBend <= FORM_THRESHOLDS.kneeBendMax;
    checkpoints.push({
      name: "Knee Bend",
      passed,
      detail: passed
        ? `Knee angle ${Math.round(kneeBend)}° — good slide position`
        : kneeBend < FORM_THRESHOLDS.kneeBendMin
          ? `Knee angle ${Math.round(kneeBend)}° — too deep, may lose balance`
          : `Knee angle ${Math.round(kneeBend)}° — too straight, bend more at foul line`,
    });
  }

  // 3. Follow-through (wrist rises above shoulder within N frames after release)
  const endCheck = Math.min(releaseIdx + FORM_THRESHOLDS.followThroughFrames, poses.length - 1);
  let followThrough = false;
  for (let i = releaseIdx + 1; i <= endCheck; i++) {
    const w = poses[i].landmarks[wristIdx];
    const s = poses[i].landmarks[shoulderIdx];
    if (w && s && w.y < s.y) { // y decreases going up in image coords
      followThrough = true;
      break;
    }
  }
  checkpoints.push({
    name: "Follow-Through",
    passed: followThrough,
    detail: followThrough
      ? "Good follow-through — hand finishes above shoulder"
      : "Incomplete follow-through — extend arm upward after release",
  });

  // 4. Balance at release (shoulder over hip alignment)
  const lShoulder = p[POSE_LANDMARKS.LEFT_SHOULDER];
  const rShoulder = p[POSE_LANDMARKS.RIGHT_SHOULDER];
  const lHip = p[POSE_LANDMARKS.LEFT_HIP];
  const rHip = p[POSE_LANDMARKS.RIGHT_HIP];
  if (lShoulder && rShoulder && lHip && rHip) {
    const shoulderMidX = (lShoulder.x + rShoulder.x) / 2;
    const hipMidX = (lHip.x + rHip.x) / 2;
    const offset = Math.abs(shoulderMidX - hipMidX);
    const passed = offset < 0.05; // less than 5% of frame width
    checkpoints.push({
      name: "Balance",
      passed,
      detail: passed
        ? "Shoulders aligned over hips — good balance at release"
        : "Leaning to one side — keep torso centered over hips",
    });
  }

  const passedCount = checkpoints.filter((c) => c.passed).length;
  const overallScore = checkpoints.length > 0
    ? Math.round((passedCount / checkpoints.length) * 100)
    : 0;

  return { checkpoints, overallScore };
}
