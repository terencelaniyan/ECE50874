# Phase 1 Implementation Guide — 3D Physics Simulation

**Date:** 2026-03-14
**Status:** PLANNED — Current implementation is 2D parametric fallback only.

This document provides the technical specification for completing Phase 1 as defined in the proposal: *"Rapier3D rigid-body simulation with a dual-friction model, Three.js rendering pipeline, and a manual parameter input interface."*

---

## 1. Current State vs. Target

### What Exists (2D Parametric — `SimulationView.tsx`)

```
User Input → Parametric Math (Bézier) → SVG Path → Animated Ball
```

- **Rendering:** 2D top-down SVG (80px wide lane, board lines, oil/dry zone rectangles)
- **Physics:** Heuristic Bézier curve computed from tuning factors (not physics equations)
- **Trajectory:** Single cubic Bézier `M start C cp1 cp2 end` with 4 control points
- **Phase detection:** Static 3:2:1.5 ratio bar (not computed from simulation)
- **Oil patterns:** 4 hardcoded strings with extracted length-in-feet

### What Must Be Built (3D Rapier3D + Three.js)

```
User Input → Physics Worker (Rapier3D WASM) → Position Time Series → Three.js Scene → WebGL Canvas
```

- **Rendering:** 3D lane with perspective camera, pin deck, ball mesh, trajectory trail
- **Physics:** Rigid-body dynamics with dual-state friction (kinetic + rolling), Euler equations for rotation
- **Trajectory:** Time-stepped position/velocity/angular-velocity arrays from Rapier3D solver
- **Phase detection:** Computed from velocity data (skid: v > Rω, hook: ω accelerating, roll: v ≈ Rω)
- **Oil patterns:** Fetched from `oil_patterns` DB table with per-zone friction coefficients

---

## 2. Architecture

### Thread Model (from proposal Section IV-A)

```
┌─────────────────┐     postMessage      ┌──────────────────┐
│   Main Thread    │ ◄──────────────────► │  Physics Worker   │
│                  │                      │                  │
│  React UI        │  {speed, rev,        │  Rapier3D WASM   │
│  Three.js Render │   angle, ball_spec}  │  World + Bodies   │
│  State Mgmt      │ ──────────────────►  │  Friction Zones   │
│                  │                      │  Step Loop        │
│  requestAnim-    │  [{t, x, y, z,      │                  │
│  ationFrame      │    vx, vy, vz,      │  Δt = 1/120s     │
│  draws scene     │    ωx, ωy, ωz}, …]  │  ~3.5s simulated  │
│  from position   │ ◄──────────────────  │  = 420 steps      │
│  time series     │                      │                  │
└─────────────────┘                      └──────────────────┘
```

### New Files

| File | Purpose |
|---|---|
| `src/workers/physics-worker.ts` | Rapier3D WASM physics simulation loop |
| `src/components/SimulationView3D.tsx` | Three.js 3D lane scene + controls |
| `src/utils/parametric-physics.ts` | Extracted 2D fallback physics (from current SimulationView) |
| `src/utils/phase-detector.ts` | Classify skid/hook/roll from velocity data |
| `src/types/simulation.ts` | TypeScript types for physics messages and results |

### Modified Files

| File | Change |
|---|---|
| `src/components/Layout.tsx` | Add "3D SIM" tab or replace existing simulation tab |
| `package.json` | Add `three`, `@types/three`, `@dimforge/rapier3d-compat` |
| Backend: `scripts/migrate_oil_patterns.py` | Create `oil_patterns` table |
| Backend: `app/main.py` | Add `GET /oil-patterns` endpoint |
| Backend: `app/api_models.py` | Add `OilPattern` and `OilPatternsResponse` schemas |

---

## 3. Physics Model Specification

### 3.1 Equations of Motion (from proposal Section IV-B)

**Translational:**
```
F_net = m·a
```

**Rotational** (Euler's equations for rigid body with asymmetric inertia tensor **I**):
```
ΣM = I·α + ω × (I·ω)     (proposal eq. 1)
```

For asymmetric-core balls, the principal moments I_Gx ≠ I_Gy ≠ I_Gz cause the spin axis to precess, producing track flare.

### 3.2 Dual-State Friction

**Kinetic (sliding) friction** — while contact-point velocity v_p ≠ 0:
```
F_k = -μ_k · N · (v_p / |v_p|)     (proposal eq. 2)
```

Where:
- N = m·g (normal force)
- μ_k depends on the ball's lane position (friction zone)

**Zone friction coefficients:**
| Zone | Boards | μ_k | Source |
|---|---|---|---|
| Oiled front-end | 1–38 (house shot) | 0.04 | Proposal + USBC [13] |
| Dry backend | 39–60 | 0.18–0.22 | Proposal + coverstock type [13,14] |

**Static (rolling) friction** — when |v_p| < ε (configurable, ε = 0.01 m/s):
```
μ_r ≈ 0.01     (rolling resistance in pure roll)
```

### 3.3 Friction Zone Lookup

The lane is divided into discrete zones. Each zone specifies a μ_k value. The Physics Worker performs a zone lookup at each time step based on the ball's (X, Y) position.

For the initial implementation, zones are defined by oil pattern length:
- Zone 1 (oil): Y = 0 to `pattern_length_ft` → μ_k = 0.04
- Zone 2 (dry): Y = `pattern_length_ft` to 60ft → μ_k = 0.20

Future: per-board oil-unit distributions from the `oil_patterns` table for variable friction across the lane width.

### 3.4 State Transitions

```
SKID ──(friction increases)──► HOOK ──(velocity sync achieved)──► ROLL
 v > Rω                        ω accelerating                     |v - Rω| < ε
```

- **Skid:** Ball slides with minimal directional change (translational velocity exceeds rim speed)
- **Hook:** Increased friction causes angular velocity to accelerate; trajectory curves
- **Roll:** Translational and angular velocities synchronize (v = Rω); pure rolling motion to pins

### 3.5 Simulation Parameters

| Parameter | Value | Source |
|---|---|---|
| Time step Δt | 1/120 s | Proposal (twice rendering rate) |
| Simulation duration | ~3.5 s | Typical ball travel time foul-to-pins |
| Total steps | ~420 | 3.5 / (1/120) |
| Ball mass | 6.8 kg (15 lb) | Standard bowling ball |
| Ball radius | 0.1085 m (4.25 in) | Standard bowling ball |
| Gravity | 9.81 m/s² | Standard |
| Lane length | 18.288 m (60 ft) | USBC specification |
| Lane width | 1.0668 m (42 in) | USBC specification |

---

## 4. Three.js Scene Specification

### 4.1 Geometry

| Object | Geometry | Material |
|---|---|---|
| Lane surface | PlaneGeometry(1.07, 18.29) | MeshStandardMaterial with wood texture, oil tint overlay |
| Gutters | Two BoxGeometry strips alongside lane | Dark material |
| Pin deck | 10 CylinderGeometry objects in triangle formation | White material |
| Ball | SphereGeometry(0.1085) | MeshPhysicalMaterial with metallic finish |
| Trajectory trail | Line2 (fat lines) or TubeGeometry along position array | Emissive neon material (match UI accent color) |
| Board lines | LineSegments every 1/39 of lane width | Subtle grid |

### 4.2 Camera

| Mode | Position | Target | Use |
|---|---|---|---|
| Overhead | (0, 20, 9) | (0, 0, 9) | Default — similar to current 2D view |
| Chase | Behind ball, following trajectory | Ball position | Activated during simulation playback |
| Pin view | Behind pins looking down lane | Ball | Post-simulation |

### 4.3 Lighting

- AmbientLight (soft fill, intensity 0.4)
- DirectionalLight (overhead, casting shadows, intensity 0.8)
- Optional PointLight at pin deck for drama

### 4.4 Animation Loop

```typescript
function animate() {
  requestAnimationFrame(animate);

  if (trajectoryData && playbackIndex < trajectoryData.length) {
    const frame = trajectoryData[playbackIndex];
    ballMesh.position.set(frame.x, frame.y, frame.z);
    ballMesh.rotation.set(frame.rx, frame.ry, frame.rz);
    trailPoints.push(new Vector3(frame.x, frame.y, frame.z));
    updateTrailGeometry();
    playbackIndex++;
  }

  renderer.render(scene, activeCamera);
}
```

---

## 5. Physics Worker Protocol

### 5.1 Main Thread → Worker Messages

```typescript
// Initialize world
{ type: "init" }

// Run simulation
{
  type: "simulate",
  params: {
    speed: number,        // m/s (converted from mph)
    revRate: number,      // rad/s (converted from rpm)
    launchAngle: number,  // radians
    boardPosition: number, // 1-39
    ballSpec: {
      rg: number,
      diff: number,
      intDiff: number,
      mass: number,       // kg (default 6.8)
      radius: number,     // m (default 0.1085)
    },
    oilPattern: {
      name: string,
      lengthFt: number,
      zones: Array<{ startFt: number, endFt: number, mu: number }>,
    },
  }
}
```

### 5.2 Worker → Main Thread Messages

```typescript
// Simulation complete
{
  type: "result",
  trajectory: Array<{
    t: number,       // time in seconds
    x: number,       // lateral position (meters, 0 = left gutter)
    y: number,       // height (always ~radius for on-lane)
    z: number,       // down-lane position (0 = foul line, 18.29 = pins)
    vx: number,      // lateral velocity
    vz: number,      // down-lane velocity
    wx: number,      // angular velocity x
    wy: number,      // angular velocity y
    wz: number,      // angular velocity z
    phase: "skid" | "hook" | "roll",
  }>,
  summary: {
    entryAngle: number,     // degrees
    breakpointBoard: number,
    skidLengthFt: number,
    hookLengthFt: number,
    rollLengthFt: number,
    totalTimeSec: number,
    outcome: string,
  }
}

// Error
{ type: "error", message: string }
```

---

## 6. Validation Criteria (from proposal)

> "Trajectory exhibits three distinct phases (skid, hook, and roll) consistent with USBC qualitative descriptions."

**Quantitative checks:**
1. Skid segment: >95% linear fit (R² > 0.95) — ball travels mostly straight on oil
2. Hook segment: trajectory curvature increases (parabolic arc)
3. Roll segment: velocity synchronization |v - Rω| < 0.05 m/s
4. Entry angle: 4–6° for a standard house shot with benchmark ball

**Test approach:** Unit test the phase detector with known trajectory data. Integration test the full physics worker with expected output ranges.

---

## 7. Fallback Strategy

If Rapier3D integration proves unstable or too slow:

1. **Keep the current 2D parametric model** as the default simulation tab
2. **Add the 3D view as a separate "3D SIM (Beta)" tab** so users can opt in
3. **Extract the parametric physics** into `src/utils/parametric-physics.ts` with a clean interface so it can be unit-tested independently

The proposal explicitly identifies this fallback:
> "If rigid-body solver coupling proves unstable, fallback to a simplified kinematic model with parabolic trajectory approximation."

---

## 8. Dependencies to Add

```json
{
  "three": "^0.170.0",
  "@types/three": "^0.170.0",
  "@dimforge/rapier3d-compat": "^0.14.0"
}
```

**Bundle size impact:** Three.js ~600KB gzip, Rapier3D WASM ~400KB. Total ~1MB additional. Acceptable for a desktop-first application. Consider lazy loading the simulation tab.
