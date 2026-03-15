/**
 * PBA / USBC bowling performance baselines.
 * Sources: USBC Ball Motion Study, PBA telemetry averages.
 */

export interface BaselineRange {
  label: string;
  min: number;
  max: number;
  unit: string;
}

/** Ball speed at release (mph). */
export const SPEED_BASELINES: BaselineRange[] = [
  { label: "PBA Tour Average", min: 17.0, max: 18.5, unit: "mph" },
  { label: "USBC Recreational", min: 14.0, max: 17.0, unit: "mph" },
  { label: "High Rev Player", min: 15.0, max: 17.0, unit: "mph" },
  { label: "Stroker",          min: 17.5, max: 20.0, unit: "mph" },
];

/** Rev rate (RPM). */
export const REV_RATE_BASELINES: BaselineRange[] = [
  { label: "PBA Tour Average", min: 300, max: 400, unit: "rpm" },
  { label: "High Rev (Belmonte)", min: 450, max: 550, unit: "rpm" },
  { label: "Stroker (Duke)",   min: 250, max: 320, unit: "rpm" },
  { label: "Recreational",     min: 150, max: 280, unit: "rpm" },
];

/** Launch angle (degrees from straight). */
export const LAUNCH_ANGLE_BASELINES: BaselineRange[] = [
  { label: "PBA Average", min: 1.5, max: 4.0, unit: "deg" },
  { label: "Cranker",     min: 3.0, max: 6.0, unit: "deg" },
  { label: "Stroker",     min: 1.0, max: 2.5, unit: "deg" },
];

/** Form checkpoint thresholds. */
export const FORM_THRESHOLDS = {
  /** Arm should be within this many degrees of vertical at release. */
  armVerticalityMaxDeg: 15,
  /** Knee bend angle range (degrees) at release — too straight or too deep is bad. */
  kneeBendMin: 140,
  kneeBendMax: 170,
  /** Follow-through: wrist should rise above shoulder after release. */
  followThroughFrames: 8,
} as const;

/** MediaPipe BlazePose landmark indices we use. */
export const POSE_LANDMARKS = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  NOSE: 0,
} as const;
