/**
 * Types for the 3D physics simulation (Rapier3D + Three.js).
 */

/** Parameters sent from UI to physics worker. */
export interface PhysicsParams {
  speed: number;         // mph → converted to m/s in worker
  revRate: number;       // rpm → converted to rad/s in worker
  launchAngle: number;   // degrees
  boardPosition: number; // 1–39
  ballSpec: {
    rg: number;
    diff: number;
    intDiff: number;
    mass: number;        // kg (default 6.8)
    radius: number;      // m (default 0.1085)
  };
  oilPattern: {
    name: string;
    lengthFt: number;
    zones: FrictionZone[];
  };
}

export interface FrictionZone {
  startFt: number;
  endFt: number;
  mu: number;
}

/** Per-frame pin transform (position + quaternion). */
export interface PinTransform {
  x: number; y: number; z: number;
  qx: number; qy: number; qz: number; qw: number;
}

/** Single frame of trajectory data returned by physics worker. */
export interface TrajectoryFrame {
  t: number;       // time in seconds
  x: number;       // lateral position (meters, 0 = center of lane)
  y: number;       // height (≈ ball radius when on lane)
  z: number;       // down-lane position (0 = foul line, 18.29 = pins)
  qx: number;      // ball quaternion
  qy: number;
  qz: number;
  qw: number;
  vx: number;      // lateral velocity m/s
  vz: number;      // down-lane velocity m/s
  wx: number;      // angular velocity x rad/s
  wy: number;      // angular velocity y rad/s
  wz: number;      // angular velocity z rad/s
  phase: "skid" | "hook" | "roll";
  pins?: PinTransform[];  // pin positions this frame (only after ball reaches deck)
}

/** Pin state after collision. */
export interface PinState {
  index: number;      // 0-9 (pin 1=0, pin 10=9)
  x: number;
  y: number;
  z: number;
  fallen: boolean;
}

/** Summary computed after simulation completes. */
export interface SimulationSummary {
  entryAngle: number;      // degrees
  breakpointBoard: number;
  skidLengthFt: number;
  hookLengthFt: number;
  rollLengthFt: number;
  totalTimeSec: number;
  outcome: string;
  outcomeClass: "good" | "warn" | "bad";
  pinsDown: number;
  pinStates: PinState[];
}

/** Messages between main thread and physics worker. */
export type PhysicsWorkerMessage =
  | { type: "init" }
  | { type: "ready" }
  | { type: "simulate"; params: PhysicsParams }
  | { type: "result"; trajectory: TrajectoryFrame[]; summary: SimulationSummary }
  | { type: "error"; message: string };

// ── Lane Constants (USBC spec) ──────────────────────────────────────────
export const LANE_LENGTH_M = 18.288;    // 60 ft
export const LANE_LENGTH_FT = 60;
export const LANE_WIDTH_M = 1.0636;     // 41.875 inches (USBC spec, 39 boards)
export const LANE_WIDTH_IN = 41.875;
export const BOARDS = 39;
export const BALL_MASS_KG = 6.8;        // 15 lb
export const BALL_RADIUS_M = 0.1085;    // 4.25 in diameter
export const GRAVITY = 9.81;
export const DT = 1 / 120;             // time step (twice render rate)
export const SIM_DURATION = 3.5;        // seconds
export const SIM_STEPS = Math.ceil(SIM_DURATION / DT); // ~420

// Pin constants (USBC spec)
export const PIN_HEIGHT_M = 0.381;      // 15 in
export const PIN_MASS_KG = 1.53;        // 3 lb 6 oz
export const PIN_SPACING_M = 0.3048;    // 12 in center-to-center

// Pin profile radii (USBC spec)
export const PIN_R_BOT = 0.057;         // base visual radius
export const PIN_R_MID = 0.0605;        // belly radius (4.766" diameter)
export const PIN_R_NECK = 0.023;        // neck radius (1.797" diameter)

// Gutter specs (USBC)
export const GUTTER_WIDTH_M = 0.235;    // 9.25 in
export const GUTTER_DEPTH_M = 0.0476;   // 1.875 in

// Approach
export const APPROACH_LENGTH_M = 4.572; // 15 ft

/** Convert mph to m/s. */
export function mphToMs(mph: number): number {
  return mph * 0.44704;
}

/** Convert rpm to rad/s. */
export function rpmToRads(rpm: number): number {
  return (rpm * 2 * Math.PI) / 60;
}

/** Convert board number (1-39) to lateral position in meters (0 = left edge). */
export function boardToMeters(board: number): number {
  return (board / BOARDS) * LANE_WIDTH_M;
}

/** Convert meters down-lane to feet. */
export function metersToFeet(m: number): number {
  return m * 3.28084;
}
