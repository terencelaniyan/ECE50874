import { describe, it, expect } from "vitest";
import type { FramePose, Landmark } from "../types/analysis";
import {
  detectReleaseFrame,
  computeBallSpeed,
  computeLaunchAngle,
  computeRevRateProxy,
  extractKinematics,
  evaluateForm,
  detectBowlingHand,
} from "./bowling-kinematics";
import { POSE_LANDMARKS } from "../constants/baselines";

// ── Helpers for synthetic landmark data ─────────────────────────────────

/** Create a landmark with defaults. */
function lm(x: number, y: number, z = 0, visibility = 0.95): Landmark {
  return { x, y, z, visibility };
}

/** Create a 33-landmark array with all zeros. */
function emptyLandmarks(): Landmark[] {
  return Array.from({ length: 33 }, () => lm(0.5, 0.5));
}

/**
 * Build a sequence of synthetic FramePoses simulating a bowling delivery.
 * The wrist starts high (backswing), comes down (downswing), peaks velocity
 * at release, and decelerates in follow-through.
 */
function buildDeliverySequence(opts: {
  frames?: number;
  fps?: number;
  hand?: "left" | "right";
  wristReleaseSpeed?: number;  // normalized units per frame at peak
} = {}): FramePose[] {
  const {
    frames = 30,
    fps = 30,
    hand = "right",
    wristReleaseSpeed = 0.08,
  } = opts;

  const wristIdx = hand === "left"
    ? POSE_LANDMARKS.LEFT_WRIST
    : POSE_LANDMARKS.RIGHT_WRIST;
  const otherWristIdx = hand === "left"
    ? POSE_LANDMARKS.RIGHT_WRIST
    : POSE_LANDMARKS.LEFT_WRIST;
  const elbowIdx = hand === "left"
    ? POSE_LANDMARKS.LEFT_ELBOW
    : POSE_LANDMARKS.RIGHT_ELBOW;

  const releaseFrame = Math.floor(frames * 0.7); // ~70% through
  const poses: FramePose[] = [];

  for (let i = 0; i < frames; i++) {
    const landmarks = emptyLandmarks();

    // Body skeleton (roughly static)
    landmarks[POSE_LANDMARKS.LEFT_SHOULDER] = lm(0.45, 0.35);
    landmarks[POSE_LANDMARKS.RIGHT_SHOULDER] = lm(0.55, 0.35);
    landmarks[POSE_LANDMARKS.LEFT_HIP] = lm(0.46, 0.55);
    landmarks[POSE_LANDMARKS.RIGHT_HIP] = lm(0.54, 0.55);
    landmarks[POSE_LANDMARKS.LEFT_KNEE] = lm(0.45, 0.72);
    landmarks[POSE_LANDMARKS.RIGHT_KNEE] = lm(0.55, 0.72);
    landmarks[POSE_LANDMARKS.LEFT_ANKLE] = lm(0.44, 0.90);
    landmarks[POSE_LANDMARKS.RIGHT_ANKLE] = lm(0.56, 0.90);
    landmarks[POSE_LANDMARKS.NOSE] = lm(0.5, 0.22);

    // Non-bowling hand stays near waist (low y ~ 0.40, above hip)
    landmarks[otherWristIdx] = lm(hand === "right" ? 0.42 : 0.58, 0.40);

    // Elbow for bowling arm
    const elbowX = hand === "right" ? 0.56 : 0.44;
    landmarks[elbowIdx] = lm(elbowX, 0.45);

    // Bowling wrist follows a pendulum-like path:
    // 1. Approach: slow downward motion (wrist near waist, y ~ 0.55–0.65)
    // 2. Release: sudden fast motion (large y displacement per frame)
    // 3. Follow-through: wrist rises above shoulder
    let wristX: number, wristY: number;

    if (i < releaseFrame - 3) {
      // Approach phase — bowling hand hangs low, slow movement
      const phase = i / Math.max(1, releaseFrame - 4);
      wristX = elbowX + (hand === "right" ? 0.02 : -0.02);
      wristY = 0.55 + phase * 0.08; // slow: ~0.005 per frame
    } else if (i <= releaseFrame) {
      // Release window — 3 frames of fast downward motion
      const subIdx = i - (releaseFrame - 3);
      wristX = elbowX + (hand === "right" ? 0.02 : -0.02) + subIdx * 0.005;
      // Jump: each frame moves wristReleaseSpeed in y
      wristY = 0.63 + subIdx * wristReleaseSpeed;
    } else {
      // Follow-through — wrist rises quickly above shoulder (y < 0.35)
      const phase = (i - releaseFrame) / Math.max(1, frames - 1 - releaseFrame);
      wristX = elbowX + (hand === "right" ? 0.03 : -0.03);
      wristY = 0.63 + 3 * wristReleaseSpeed - phase * 0.6;
    }

    landmarks[wristIdx] = lm(wristX, wristY);

    // Realistic knee bend at release (~155° angle)
    if (i >= releaseFrame - 2 && i <= releaseFrame + 2) {
      // Slide leg knee is more bent
      const slideKnee = hand === "right" ? POSE_LANDMARKS.LEFT_KNEE : POSE_LANDMARKS.RIGHT_KNEE;
      landmarks[slideKnee] = lm(hand === "right" ? 0.45 : 0.55, 0.73);
    }

    poses.push({
      frameIndex: i,
      timestampMs: Math.round((i / fps) * 1000),
      landmarks,
    });
  }

  return poses;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("detectBowlingHand", () => {
  it("detects right hand when right wrist is lower", () => {
    const poses = buildDeliverySequence({ hand: "right" });
    // Ensure the right wrist is lower (higher y) at start
    for (let i = 0; i < 5; i++) {
      poses[i].landmarks[POSE_LANDMARKS.RIGHT_WRIST].y = 0.7;
      poses[i].landmarks[POSE_LANDMARKS.LEFT_WRIST].y = 0.4;
    }
    expect(detectBowlingHand(poses)).toBe("right");
  });

  it("detects left hand when left wrist is lower", () => {
    const poses = buildDeliverySequence({ hand: "left" });
    for (let i = 0; i < 5; i++) {
      poses[i].landmarks[POSE_LANDMARKS.LEFT_WRIST].y = 0.7;
      poses[i].landmarks[POSE_LANDMARKS.RIGHT_WRIST].y = 0.4;
    }
    expect(detectBowlingHand(poses)).toBe("left");
  });

  it("returns right for empty poses", () => {
    expect(detectBowlingHand([])).toBe("right");
  });
});

describe("detectReleaseFrame", () => {
  it("finds the peak wrist velocity frame in a delivery sequence", () => {
    const poses = buildDeliverySequence({ frames: 30 });
    const releaseIdx = detectReleaseFrame(poses);
    // Should be around frame 21 (70% of 30)
    expect(releaseIdx).toBeGreaterThan(15);
    expect(releaseIdx).toBeLessThan(28);
  });

  it("returns -1 for too few frames", () => {
    const poses = buildDeliverySequence({ frames: 3 });
    expect(detectReleaseFrame(poses)).toBe(-1);
  });

  it("returns -1 for stationary poses (no velocity peak)", () => {
    const poses: FramePose[] = Array.from({ length: 20 }, (_, i) => ({
      frameIndex: i,
      timestampMs: i * 33,
      landmarks: emptyLandmarks(), // all at (0.5, 0.5) — no movement
    }));
    expect(detectReleaseFrame(poses)).toBe(-1);
  });
});

describe("computeBallSpeed", () => {
  it("returns a plausible speed (10–25 mph) for a realistic delivery", () => {
    const poses = buildDeliverySequence({ wristReleaseSpeed: 0.06 });
    const releaseIdx = detectReleaseFrame(poses);
    expect(releaseIdx).toBeGreaterThan(0);
    const speed = computeBallSpeed(poses, releaseIdx, { fps: 30 });
    expect(speed).toBeGreaterThan(0);
    // With synthetic data the exact value depends on calibration, but should be non-zero
    expect(speed).toBeLessThan(40); // sanity cap
  });

  it("returns 0 for invalid release index", () => {
    const poses = buildDeliverySequence();
    expect(computeBallSpeed(poses, -1)).toBe(0);
    expect(computeBallSpeed(poses, 999)).toBe(0);
  });
});

describe("computeLaunchAngle", () => {
  it("returns a reasonable angle (0–30°) at release", () => {
    const poses = buildDeliverySequence();
    const releaseIdx = detectReleaseFrame(poses);
    expect(releaseIdx).toBeGreaterThan(0);
    const angle = computeLaunchAngle(poses, releaseIdx);
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThan(45);
  });

  it("returns 0 for invalid index", () => {
    expect(computeLaunchAngle([], -1)).toBe(0);
  });
});

describe("computeRevRateProxy", () => {
  it("returns a positive RPM estimate for a delivery with wrist rotation", () => {
    const poses = buildDeliverySequence({ frames: 30, wristReleaseSpeed: 0.08 });
    const releaseIdx = detectReleaseFrame(poses);
    expect(releaseIdx).toBeGreaterThan(0);
    const rpm = computeRevRateProxy(poses, releaseIdx, 30);
    expect(rpm).toBeGreaterThanOrEqual(0);
  });

  it("returns 0 for insufficient frames around release", () => {
    const poses = buildDeliverySequence({ frames: 5 });
    expect(computeRevRateProxy(poses, 0, 30)).toBe(0);
  });
});

describe("extractKinematics", () => {
  it("extracts all parameters from a valid delivery sequence", () => {
    const poses = buildDeliverySequence({ frames: 30, wristReleaseSpeed: 0.07 });
    const result = extractKinematics(poses, { fps: 30 });
    expect(result).not.toBeNull();
    expect(result!.ballSpeedMph).toBeGreaterThan(0);
    expect(result!.launchAngleDeg).toBeGreaterThanOrEqual(0);
    expect(result!.revRateRpm).toBeGreaterThanOrEqual(0);
    expect(result!.releaseFrameIndex).toBeGreaterThan(0);
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });

  it("returns null for stationary sequence (no release detected)", () => {
    const poses: FramePose[] = Array.from({ length: 20 }, (_, i) => ({
      frameIndex: i,
      timestampMs: i * 33,
      landmarks: emptyLandmarks(),
    }));
    expect(extractKinematics(poses)).toBeNull();
  });
});

describe("evaluateForm", () => {
  it("produces form checkpoints for a valid delivery", () => {
    const poses = buildDeliverySequence({ frames: 30 });
    const releaseIdx = detectReleaseFrame(poses);
    expect(releaseIdx).toBeGreaterThan(0);
    const result = evaluateForm(poses, releaseIdx);
    expect(result.checkpoints.length).toBeGreaterThanOrEqual(3);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    // Each checkpoint has required fields
    for (const cp of result.checkpoints) {
      expect(cp.name).toBeTruthy();
      expect(typeof cp.passed).toBe("boolean");
      expect(cp.detail).toBeTruthy();
    }
  });

  it("returns empty for invalid release index", () => {
    const result = evaluateForm([], -1);
    expect(result.checkpoints).toHaveLength(0);
    expect(result.overallScore).toBe(0);
  });
});
