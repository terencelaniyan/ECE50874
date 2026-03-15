/**
 * Web Worker: Rapier3D rigid-body bowling simulation with pin physics.
 *
 * Simulates: ball trajectory with dual-state friction + 10 pin rigid bodies.
 * Falls back to kinematic model if Rapier3D WASM fails to load.
 *
 * Physics validated against USBC specs — see docs/simulation/ for audits.
 */
import type {
  PhysicsWorkerMessage,
  PhysicsParams,
  TrajectoryFrame,
  SimulationSummary,
  FrictionZone,
  PinState,
  PinTransform,
} from "../types/simulation";
import {
  LANE_LENGTH_M,
  LANE_WIDTH_M,
  BALL_RADIUS_M,
  BALL_MASS_KG,
  GRAVITY,
  DT,
  PIN_HEIGHT_M,
  PIN_MASS_KG,
  PIN_SPACING_M,
  GUTTER_WIDTH_M,
  GUTTER_DEPTH_M,
  mphToMs,
  rpmToRads,
  boardToMeters,
  metersToFeet,
} from "../types/simulation";

let RAPIER: any = null;

// Pin layout
const SP = PIN_SPACING_M;
const PIN_H = PIN_HEIGHT_M;
const PIN_POSITIONS: [number, number][] = [
  [0, 0],                                           // 1 (head pin)
  [-SP/2, SP * 0.866], [SP/2, SP * 0.866],         // 2, 3
  [-SP, SP * 1.732], [0, SP * 1.732], [SP, SP * 1.732],  // 4, 5, 6
  [-SP * 1.5, SP * 2.598], [-SP/2, SP * 2.598],    // 7, 8
  [SP/2, SP * 2.598], [SP * 1.5, SP * 2.598],      // 9, 10
];
const PIN_DECK_Z = LANE_LENGTH_M;

// 4-part compound pin collider dimensions (USBC validated)
// See docs/simulation/usbc-specs-validation.md for full derivation
const PIN_BASE_R = 0.026;      // actual deck contact patch radius (2.03" dia)
const PIN_BELLY_R = 0.058;     // just under widest (4.766" dia)
const PIN_TAPER_R = 0.036;
const PIN_NECK_COLL_R = 0.023; // USBC 1.797" neck diameter
const PIN_BASE_HH = 0.015;     // half-heights
const PIN_BELLY_HH = 0.065;
const PIN_TAPER_HH = 0.05;
const PIN_NECK_HH = 0.06;
const PIN_BODY_Y = PIN_H / 2;  // rigid body origin at pin center

// COR values (USBC: ball-pin 0.650-0.750, pin-pin ~0.50-0.60)
const PIN_COR = 0.55;
const BALL_COR = 0.70;

// Pin area geometry
const PIN_AREA_WIDTH = LANE_WIDTH_M / 2 + GUTTER_WIDTH_M + 0.3;
const PIN_AREA_END = LANE_LENGTH_M + SP * 2.6 + 1.5;

const MAX_SIM_STEPS = 2000;
const BALL_TRAVEL_STEPS = 420;
const PIN_SETTLE_STEPS = 600;

async function initRapier(): Promise<boolean> {
  try {
    const rapier = await import(/* @vite-ignore */ "@dimforge/rapier3d-compat");
    await rapier.init();
    RAPIER = rapier;
    return true;
  } catch {
    return false;
  }
}

function getMu(zFt: number, zones: FrictionZone[]): number {
  for (const zone of zones) {
    if (zFt >= zone.startFt && zFt < zone.endFt) return zone.mu;
  }
  return 0.20;
}

function classifyPhase(
  vx: number, vz: number, wx: number, _wy: number, wz: number, radius: number,
): "skid" | "hook" | "roll" {
  const vMag = Math.sqrt(vx * vx + vz * vz);
  const rimSpeed = Math.sqrt(wx * wx + wz * wz) * radius;
  const diff = Math.abs(vMag - rimSpeed);
  if (diff < 0.05) return "roll";
  if (vMag > rimSpeed * 1.1) return "skid";
  return "hook";
}

// ── Rapier3D Simulation with USBC-validated Pin Physics ─────────────────

function simulateRapier(params: PhysicsParams): {
  trajectory: TrajectoryFrame[];
  summary: SimulationSummary;
} {
  const { speed, revRate, launchAngle, boardPosition, ballSpec, oilPattern } = params;

  const v0 = mphToMs(speed);
  const omega0 = rpmToRads(revRate);
  const angleRad = (launchAngle * Math.PI) / 180;
  const startX = boardToMeters(boardPosition) - LANE_WIDTH_M / 2;
  const radius = ballSpec.radius || BALL_RADIUS_M;
  const mass = ballSpec.mass || BALL_MASS_KG;

  const gravity = new RAPIER.Vector3(0, -GRAVITY, 0);
  const world = new RAPIER.World(gravity);

  // ── Main lane floor (thick 1m slab to prevent tunneling) ──
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(LANE_WIDTH_M / 2 + 0.3, 0.5, LANE_LENGTH_M / 2 + 1)
      .setTranslation(0, -0.5, LANE_LENGTH_M / 2 - 1)
      .setFriction(0.04)
      .setRestitution(0.0),
    groundBody,
  );

  // ── Pin deck + pit floor — wide, thick, high friction (dry maple) ──
  const deckBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const deckStart = LANE_LENGTH_M - 0.5;
  const deckEnd = PIN_AREA_END;
  const deckMidZ = (deckStart + deckEnd) / 2;
  const deckHalfZ = (deckEnd - deckStart) / 2;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(PIN_AREA_WIDTH, 0.5, deckHalfZ)
      .setTranslation(0, -0.5, deckMidZ)
      .setFriction(0.45)
      .setRestitution(0.05),
    deckBody,
  );

  // ── Side floors (catch pins that scatter sideways) ──
  for (const s of [-1, 1]) {
    const sideFloorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.3, 0.5, deckHalfZ)
        .setTranslation(s * (PIN_AREA_WIDTH + 0.3), -0.5, deckMidZ)
        .setFriction(0.5)
        .setRestitution(0.0),
      sideFloorBody,
    );
  }

  // ── Gutter physics — 3 angled cuboids per side approximating semicircle ──
  for (const s of [-1, 1]) {
    const gw = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const cx = s * (LANE_WIDTH_M / 2 + GUTTER_WIDTH_M / 2);

    // Bottom flat
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(GUTTER_WIDTH_M * 0.3, 0.01, LANE_LENGTH_M / 2)
        .setTranslation(cx, -GUTTER_DEPTH_M, LANE_LENGTH_M / 2)
        .setFriction(0.3),
      gw,
    );
    // Inner slope (~30°)
    const slopeBody1 = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const innerX = s * (LANE_WIDTH_M / 2 + GUTTER_WIDTH_M * 0.15);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(GUTTER_WIDTH_M * 0.2, 0.01, LANE_LENGTH_M / 2)
        .setTranslation(innerX, -GUTTER_DEPTH_M * 0.4, LANE_LENGTH_M / 2)
        .setRotation({ x: 0, y: 0, z: s * 0.5, w: Math.cos(0.25) })
        .setFriction(0.3),
      slopeBody1,
    );
    // Outer slope (~30°)
    const slopeBody2 = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const outerX = s * (LANE_WIDTH_M / 2 + GUTTER_WIDTH_M * 0.85);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(GUTTER_WIDTH_M * 0.2, 0.01, LANE_LENGTH_M / 2)
        .setTranslation(outerX, -GUTTER_DEPTH_M * 0.4, LANE_LENGTH_M / 2)
        .setRotation({ x: 0, y: 0, z: -s * 0.5, w: Math.cos(0.25) })
        .setFriction(0.3),
      slopeBody2,
    );

    // Gutter inner wall (lane edge)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.005, 0.05, LANE_LENGTH_M / 2)
        .setTranslation(s * (LANE_WIDTH_M / 2 + 0.005), 0.01, LANE_LENGTH_M / 2),
      gw,
    );
  }

  // ── Kickback walls (vertical plates flanking pin deck — pins bounce off) ──
  for (const s of [-1, 1]) {
    const kickBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.03, 0.4, deckHalfZ)
        .setTranslation(s * PIN_AREA_WIDTH, 0.4, deckMidZ)
        .setFriction(0.3)
        .setRestitution(0.35),
      kickBody,
    );
  }

  // ── Pit back wall ──
  const backWallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(PIN_AREA_WIDTH + 0.3, 0.5, 0.05)
      .setTranslation(0, 0.3, PIN_AREA_END)
      .setFriction(0.5)
      .setRestitution(0.2),
    backWallBody,
  );

  // ── Bowling ball ──
  const effectiveRad = angleRad * 0.35;
  const ballBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(startX, radius + 0.002, 0.1)
    .setLinvel(-Math.sin(effectiveRad) * v0, 0, Math.cos(effectiveRad) * v0)
    .setAngvel({ x: v0 / radius, y: omega0 * 0.5, z: 0 }) // x: forward roll, y: hook spin
    .setCcdEnabled(true)
    .setLinearDamping(0.01)
    .setAngularDamping(0.01)
    .setGravityScale(1.0);

  const rgM = ballSpec.rg * 0.0254;
  const I_base = mass * rgM * rgM;
  const diffFactor = 1 + ballSpec.diff * 10;
  ballBodyDesc.setAdditionalMassProperties(
    mass,
    new RAPIER.Vector3(0, 0, 0),
    new RAPIER.Vector3(I_base, I_base * diffFactor, I_base),
    new RAPIER.Rotation(0, 0, 0, 1),
  );

  const ballBody = world.createRigidBody(ballBodyDesc);
  world.createCollider(
    RAPIER.ColliderDesc.ball(radius)
      .setRestitution(BALL_COR)
      .setFriction(0.03)
      .setDensity(mass / ((4 / 3) * Math.PI * radius ** 3)),
    ballBody,
  );

  // ── 10 Pins — 4-part compound colliders (USBC validated) ──
  // Base (narrow contact patch) → Belly (heaviest) → Taper → Neck
  // Resulting COM ≈ 0.137m from ground, tipping angle ≈ 10.8°
  const pinBodies: any[] = [];
  for (const [px, pz] of PIN_POSITIONS) {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(px, PIN_BODY_Y, PIN_DECK_Z + pz)
      .setCcdEnabled(true)
      .setAngularDamping(0.5)
      .setLinearDamping(0.3);
    const body = world.createRigidBody(desc);

    // Base (y=0 to 0.03, center at 0.015) — narrow contact patch, determines tipping
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(PIN_BASE_HH, PIN_BASE_R)
        .setTranslation(0, 0.015 - PIN_BODY_Y, 0)
        .setDensity((PIN_MASS_KG * 0.12) / (Math.PI * PIN_BASE_R ** 2 * PIN_BASE_HH * 2))
        .setRestitution(PIN_COR)
        .setFriction(0.45),
      body,
    );
    // Belly (y=0.03 to 0.16, center at 0.095) — heaviest segment
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(PIN_BELLY_HH, PIN_BELLY_R)
        .setTranslation(0, 0.095 - PIN_BODY_Y, 0)
        .setDensity((PIN_MASS_KG * 0.55) / (Math.PI * PIN_BELLY_R ** 2 * PIN_BELLY_HH * 2))
        .setRestitution(PIN_COR)
        .setFriction(0.40),
      body,
    );
    // Taper (y=0.16 to 0.26, center at 0.21)
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(PIN_TAPER_HH, PIN_TAPER_R)
        .setTranslation(0, 0.21 - PIN_BODY_Y, 0)
        .setDensity((PIN_MASS_KG * 0.21) / (Math.PI * PIN_TAPER_R ** 2 * PIN_TAPER_HH * 2))
        .setRestitution(PIN_COR)
        .setFriction(0.35),
      body,
    );
    // Neck + head (y=0.26 to 0.38, center at 0.32)
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(PIN_NECK_HH, PIN_NECK_COLL_R)
        .setTranslation(0, 0.32 - PIN_BODY_Y, 0)
        .setDensity((PIN_MASS_KG * 0.12) / (Math.PI * PIN_NECK_COLL_R ** 2 * PIN_NECK_HH * 2))
        .setRestitution(PIN_COR)
        .setFriction(0.30),
      body,
    );

    pinBodies.push(body);
  }

  // ── Hook mechanics ──
  const coverstockMultiplier: Record<string, number> = {
    solid: 1.0, hybrid: 0.88, pearl: 0.75, urethane: 0.50, plastic: 0.08,
  };
  const coverMult = coverstockMultiplier["solid"] ?? 0.8;
  const hookFactor = ballSpec.diff * coverMult;
  const rgOffset = (ballSpec.rg - 2.50) * 3.0;
  const oilEndM = (oilPattern.lengthFt * 0.3048) + rgOffset;

  // ── Run simulation ──
  const trajectory: TrajectoryFrame[] = [];
  let ballPastPins = false;
  let settleSteps = 0;

  for (let step = 0; step < MAX_SIM_STEPS; step++) {
    const pos = ballBody.translation();
    const vel = ballBody.linvel();

    // Hook injection on dry backend
    if (pos.z > oilEndM && pos.z < LANE_LENGTH_M && pos.y > -0.1) {
      const dryProgress = Math.min(1, (pos.z - oilEndM) / (LANE_LENGTH_M - oilEndM));
      const hookCurve = Math.sin(dryProgress * Math.PI * 0.7);
      const maxHookVx = Math.min(0.30, omega0 * hookFactor * 0.25);
      const hookVx = -maxHookVx * hookCurve;
      const baseVx = -Math.sin(effectiveRad) * Math.abs(vel.z) / (Math.cos(effectiveRad) || 1);
      ballBody.setLinvel({ x: baseVx + hookVx, y: Math.min(vel.y, 0), z: vel.z }, true);
    }

    // Anti-bounce on lane: ball COR 0.70 is needed for pins but causes lane bounce
    if (pos.z < LANE_LENGTH_M) {
      const excess = pos.y - (radius + 0.005);
      if (excess > 0) {
        ballBody.setLinvel({ x: vel.x, y: Math.min(vel.y, -excess * 20), z: vel.z }, true);
      }
    }

    // Pit curtain: heavy damping once ball clears pin triangle
    if (pos.z > LANE_LENGTH_M + SP * 2.6 + 0.1) {
      ballBody.setLinearDamping(8.0);
      ballBody.setAngularDamping(3.0);
      if (vel.z < 0) {
        ballBody.setLinvel({ x: vel.x * 0.5, y: vel.y, z: 0 }, true);
      }
    }

    world.step();

    const postPos = ballBody.translation();
    const postVel = ballBody.linvel();
    const postAngvel = ballBody.angvel();

    if (!ballPastPins && postPos.z > LANE_LENGTH_M) {
      ballPastPins = true;
    }
    if (ballPastPins) settleSteps++;

    // Record every 2nd step for playback
    if (step % 2 === 0) {
      const t = step * DT;
      const rot = ballBody.rotation();
      const phase = classifyPhase(postVel.x, postVel.z, postAngvel.x, postAngvel.y, postAngvel.z, radius);

      // Always record pin transforms for rendering
      const pins: PinTransform[] = pinBodies.map((body: any) => {
        const pp = body.translation();
        const pq = body.rotation();
        return { x: pp.x, y: pp.y, z: pp.z, qx: pq.x, qy: pq.y, qz: pq.z, qw: pq.w };
      });

      trajectory.push({
        t, x: postPos.x, y: postPos.y, z: postPos.z,
        qx: rot.x, qy: rot.y, qz: rot.z, qw: rot.w,
        vx: postVel.x, vz: postVel.z,
        wx: postAngvel.x, wy: postAngvel.y, wz: postAngvel.z,
        phase,
        pins,
      });
    }

    // Early exit: all pins settled
    if (ballPastPins && settleSteps > 120 && settleSteps % 30 === 0) {
      let allSettled = true;
      for (const pb of pinBodies) {
        const pv = pb.linvel();
        const spd = Math.sqrt(pv.x * pv.x + pv.y * pv.y + pv.z * pv.z);
        if (spd > 0.05) { allSettled = false; break; }
      }
      if (allSettled) break;
    }
    if (ballPastPins && settleSteps > PIN_SETTLE_STEPS) break;

    // Safety: stop if ball goes way off
    if (postPos.y < -1 || postPos.z > LANE_LENGTH_M + 5) break;
  }

  // ── Compute pin results (USBC-validated thresholds) ──
  const pinStates: PinState[] = pinBodies.map((body: any, i: number) => {
    const p = body.translation();
    const origY = PIN_H / 2;
    // 5cm displacement or 4cm vertical drop = fallen
    const fallen = Math.abs(p.x - PIN_POSITIONS[i][0]) > 0.05 ||
      Math.abs(p.z - (PIN_DECK_Z + PIN_POSITIONS[i][1])) > 0.05 ||
      p.y < origY - 0.04;
    return { index: i, x: p.x, y: p.y, z: p.z, fallen };
  });
  const pinsDown = pinStates.filter((p) => p.fallen).length;

  // ── Compute trajectory summary ──
  // Forward-scan for pre-pin frame (find first frame at pins, return previous)
  let prePinIdx = trajectory.length - 1;
  for (let i = 0; i < trajectory.length; i++) {
    if (trajectory[i].z >= LANE_LENGTH_M - 0.2) {
      prePinIdx = Math.max(0, i - 1);
      break;
    }
  }
  const lastLane = trajectory[prePinIdx];

  const entryAngle = Math.abs(Math.atan2(lastLane.vx, lastLane.vz) * (180 / Math.PI));
  const skidEnd = trajectory.findIndex((f) => f.phase !== "skid");
  const rollStart = trajectory.findIndex((f) => f.phase === "roll");
  const skidFt = skidEnd > 0 ? metersToFeet(trajectory[skidEnd].z) : 0;
  const hookFt = rollStart > skidEnd && rollStart > 0
    ? metersToFeet(trajectory[rollStart].z) - skidFt
    : metersToFeet(lastLane.z) - skidFt;
  const rollFt = Math.max(0, 60 - skidFt - hookFt);
  const breakpointBoard = Math.round(((lastLane.x + LANE_WIDTH_M / 2) / LANE_WIDTH_M) * 39);

  let outcome: string;
  let outcomeClass: "good" | "warn" | "bad";
  if (pinsDown === 10) {
    outcome = "\u2713 STRIKE!";
    outcomeClass = "good";
  } else if (pinsDown >= 8) {
    outcome = `${pinsDown} pins — near strike`;
    outcomeClass = "warn";
  } else if (pinsDown >= 5) {
    outcome = `${pinsDown} pins — pocket hit`;
    outcomeClass = "warn";
  } else if (pinsDown > 0) {
    outcome = `${pinsDown} pins — light hit`;
    outcomeClass = "bad";
  } else {
    outcome = "\u2717 GUTTER / MISS";
    outcomeClass = "bad";
  }

  world.free();

  return {
    trajectory,
    summary: {
      entryAngle: Math.round(entryAngle * 10) / 10,
      breakpointBoard,
      skidLengthFt: Math.round(skidFt),
      hookLengthFt: Math.round(Math.max(0, hookFt)),
      rollLengthFt: Math.round(Math.max(0, rollFt)),
      totalTimeSec: Math.round(lastLane.t * 100) / 100,
      outcome,
      outcomeClass,
      pinsDown,
      pinStates,
    },
  };
}

// ── Fallback kinematic model ────────────────────────────────────────────

function simulateFallback(params: PhysicsParams): {
  trajectory: TrajectoryFrame[];
  summary: SimulationSummary;
} {
  const { speed, revRate, launchAngle, boardPosition, ballSpec, oilPattern } = params;
  const v0 = mphToMs(speed);
  const omega0 = rpmToRads(revRate);
  const angleRad = (launchAngle * Math.PI) / 180;
  const startX = boardToMeters(boardPosition) - LANE_WIDTH_M / 2;
  const radius = ballSpec.radius || BALL_RADIUS_M;

  const hookPotential = ballSpec.diff * 50 * (revRate / 200) * (17 / speed) * 4;
  const patternFt = oilPattern.lengthFt;

  const trajectory: TrajectoryFrame[] = [];
  let x = startX;
  let z = 0;
  let vx = Math.sin(angleRad) * v0;
  let vz = Math.cos(angleRad) * v0;
  let wx = omega0 * 0.3;
  const wz = 0;

  for (let step = 0; step < BALL_TRAVEL_STEPS; step++) {
    const t = step * DT;
    const zFt = metersToFeet(z);
    const mu = getMu(zFt, oilPattern.zones);

    const vMag = Math.sqrt(vx * vx + vz * vz);
    if (vMag > 0.01) {
      const drag = mu * GRAVITY * DT;
      const hookForce = zFt > patternFt ? hookPotential * 0.002 : 0;
      vx += hookForce * DT - drag * (vx / vMag) * 0.1;
      vz -= drag * (vz / vMag) * 0.3;
      wx += hookForce * DT * 5;
    }

    x += vx * DT;
    z += vz * DT;

    const rimSpeed = Math.sqrt(wx * wx + wz * wz) * radius;
    const phase: "skid" | "hook" | "roll" =
      vMag > rimSpeed * 1.1 ? "skid" : Math.abs(vMag - rimSpeed) < 0.05 ? "roll" : "hook";

    trajectory.push({ t, x, y: radius, z, qx: 0, qy: 0, qz: 0, qw: 1, vx, vz, wx, wy: omega0, wz, phase });
    if (z >= LANE_LENGTH_M) break;
  }

  const last = trajectory[trajectory.length - 1];
  const entryAngle = Math.abs(Math.atan2(last.vx, last.vz) * (180 / Math.PI));
  const skidEnd = trajectory.findIndex((f) => f.phase !== "skid");
  const rollStart = trajectory.findIndex((f) => f.phase === "roll");
  const skidFt = skidEnd > 0 ? metersToFeet(trajectory[skidEnd].z) : patternFt;
  const hookFt = rollStart > 0 ? metersToFeet(trajectory[rollStart].z) - skidFt : 60 - skidFt;

  const pinsDown = entryAngle >= 5 ? 10 : entryAngle >= 4 ? Math.floor(7 + Math.random() * 3) : entryAngle >= 3 ? Math.floor(4 + Math.random() * 4) : Math.floor(Math.random() * 3);

  const pinStates: PinState[] = PIN_POSITIONS.map((_, i) => ({
    index: i, x: PIN_POSITIONS[i][0], y: PIN_H / 2, z: PIN_DECK_Z + PIN_POSITIONS[i][1],
    fallen: i < pinsDown,
  }));

  let outcome: string;
  let outcomeClass: "good" | "warn" | "bad";
  if (pinsDown === 10) { outcome = "\u2713 STRIKE!"; outcomeClass = "good"; }
  else if (pinsDown >= 7) { outcome = `${pinsDown} pins`; outcomeClass = "warn"; }
  else { outcome = `${pinsDown} pins — light hit`; outcomeClass = "bad"; }

  return {
    trajectory,
    summary: {
      entryAngle: Math.round(entryAngle * 10) / 10,
      breakpointBoard: Math.round(((last.x + LANE_WIDTH_M / 2) / LANE_WIDTH_M) * 39),
      skidLengthFt: Math.round(skidFt),
      hookLengthFt: Math.round(Math.max(0, hookFt)),
      rollLengthFt: Math.round(Math.max(0, 60 - skidFt - hookFt)),
      totalTimeSec: Math.round(last.t * 100) / 100,
      outcome,
      outcomeClass,
      pinsDown,
      pinStates,
    },
  };
}

// ── Worker message handler ──────────────────────────────────────────────

let rapierReady = false;

self.onmessage = async (event: MessageEvent<PhysicsWorkerMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init": {
      rapierReady = await initRapier();
      self.postMessage({ type: "ready" } satisfies PhysicsWorkerMessage);
      break;
    }
    case "simulate": {
      try {
        const result = rapierReady ? simulateRapier(msg.params) : simulateFallback(msg.params);
        self.postMessage({ type: "result", trajectory: result.trajectory, summary: result.summary } satisfies PhysicsWorkerMessage);
      } catch {
        try {
          const result = simulateFallback(msg.params);
          self.postMessage({ type: "result", trajectory: result.trajectory, summary: result.summary } satisfies PhysicsWorkerMessage);
        } catch (err2: unknown) {
          self.postMessage({ type: "error", message: err2 instanceof Error ? err2.message : "Simulation failed" } satisfies PhysicsWorkerMessage);
        }
      }
      break;
    }
  }
};
