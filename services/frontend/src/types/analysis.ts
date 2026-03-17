/** Types for bowling video pose analysis (Phase 2 — Vision Engine). */

/** Single 3D landmark from MediaPipe PoseLandmarker. */
export interface Landmark {
  x: number;  // normalized [0, 1]
  y: number;
  z: number;
  visibility: number;  // confidence [0, 1]
}

/** All landmarks for one video frame. */
export interface FramePose {
  frameIndex: number;
  timestampMs: number;
  landmarks: Landmark[];   // 33 BlazePose landmarks
}

/** Extracted bowling delivery kinematics. */
export interface BowlingKinematics {
  ballSpeedMph: number;
  launchAngleDeg: number;
  revRateRpm: number;         // estimated from forearm angular velocity
  releaseFrameIndex: number;
  releaseTimestampMs: number;
  confidence: number;          // 0–1 overall quality
}

/** Form evaluation checkpoint. */
export interface FormCheckpoint {
  name: string;
  passed: boolean;
  detail: string;
}

/** Full form evaluation result. */
export interface FormEvaluation {
  checkpoints: FormCheckpoint[];
  overallScore: number;  // 0–100
}

/** Calibration config for pixel-to-real-world conversion. */
export interface CalibrationConfig {
  bowlerHeightFeet: number;          // default 5.83 (5'10")
  shoulderToAnkleRatio: number;      // fraction of total height
  fps: number;
}

/** State machine phases for the analysis workflow. */
export type AnalysisPhase =
  | "idle"
  | "uploading"
  | "processing"
  | "reviewing"
  | "error";

/** Messages sent to/from the vision Web Worker. */
export type WorkerMessage =
  | { type: "init" }
  | { type: "ready" }
  | { type: "processFrame"; frameIndex: number; timestampMs: number; bitmap: ImageBitmap }
  | { type: "frameResult"; pose: FramePose }
  | { type: "done"; totalFrames: number }
  | { type: "error"; message: string }
  | { type: "progress"; processed: number; total: number };
