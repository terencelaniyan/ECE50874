# Physics Correctness Audit

A 10-point audit of the bowling simulation physics, verifying each subsystem for correctness against USBC specifications and published research.

## Audit Summary

| # | Subsystem | Verdict | Notes |
|---|-----------|---------|-------|
| 1 | Pin collider geometry & COM | **CORRECT** | 4-part compound: COM = 0.137m, tipping = 10.8° |
| 2 | Ball COR, friction, gravity | **CORRECT** | COR 0.70 (USBC mid-range), G = 9.81 m/s² |
| 3 | Hook injection math | **CORRECT** | Sign propagates through omega; velocity-injected in dry zone |
| 4 | Anti-bounce logic | **CORRECT** | Proportional correction, only active on lane surface |
| 5 | Pit curtain damping | **CORRECT** | Activates past pin triangle (z > LANE_L + SP*2.6 + 0.1) |
| 6 | Floor/wall collider coverage | **CORRECT** | 1m-thick floors, no gaps; kickback walls + back wall |
| 7 | Pin deck friction overlay | **CORRECT** | Friction 0.45 covers headpin to pit |
| 8 | Fallen pin detection | **CORRECT** | 5cm displacement OR 4cm vertical drop thresholds |
| 9 | Entry angle calculation | **CORRECT** | Forward-scan finds pre-pin frame; no bounce-back contamination |
| 10 | Time-based playback | **CORRECT** | FRAME_DURATION = 1000/30 matches 2-step recording interval |

## Detailed Findings

### 1. Pin Collider Geometry and Center of Mass

The pin uses a **4-part compound collider** to model the real pin profile:

```
Segment    Y-range      Radius    Mass%   Purpose
Base       0.00-0.03m   0.026m    12%     Narrow deck contact (determines tipping)
Belly      0.03-0.16m   0.058m    55%     Widest segment, heaviest
Taper      0.16-0.26m   0.036m    21%     Transition zone
Neck       0.26-0.38m   0.023m    12%     Narrowest (USBC: 1.797" dia)
```

**COM Verification:**

```
COM = (0.12 × 0.015) + (0.55 × 0.095) + (0.21 × 0.21) + (0.12 × 0.32)
    = 0.00180 + 0.05225 + 0.04410 + 0.03840
    = 0.13655m from ground
```

- Code comment: ~0.137m (35.9%). Actual: 0.137m (35.9%). **Match.**
- USBC spec: 5 5/16" = 0.135m (35.4%). **Within 2mm.**
- Tipping angle: `arctan(0.026 / 0.137) = 10.8°`. Research range: 7.5°-11°. **Within range.**

Mass fractions sum: 0.12 + 0.55 + 0.21 + 0.12 = 1.00. **Correct.**

### 2. Ball Physics Parameters

| Parameter | Value | Verification |
|-----------|-------|-------------|
| Mass | 6.8 kg | 15 lb standard ball |
| Radius | 0.1085 m | 8.5" diameter / 2 |
| COR | 0.70 | USBC range 0.650-0.750 (midpoint) |
| Lane friction | 0.03 | Research: 0.03-0.04 on oil |
| Gravity | 9.81 m/s² | Standard |
| Gravity scale | 1.0 | No artificial enhancement |
| Density formula | `mass / ((4/3)πr³)` | Correct sphere density |
| Forward roll | `angvel.x = v0 / BALL_R` | Rolling without slipping |
| Hook spin | `angvel.y = omega * 0.5` | Axis tilt component |

### 3. Hook Injection Model

The hook is modeled as velocity injection in the dry zone (past the oil pattern):

```
Activation:   ball.z > oilEnd AND ball.z < LANE_L
Hook curve:   sin(dryProgress × π × 0.7)  — peaks at ~71% through dry zone
Max lateral:  min(0.30 m/s, omega × hookFactor × 0.25)
Hook factor:  ballDiff × coverstockMultiplier
```

- Hook direction is always **-X** (leftward for right-handed bowler), which is correct
- The sign propagates through omega (always positive from UI slider)
- Y-velocity is clamped to ≤ 0 during hook injection (prevents bounce)
- Z-velocity is preserved (no artificial deceleration)

### 4. Anti-Bounce Correction

Active only on the lane surface (`ball.z < LANE_L`):

```
excess = ball.y - (BALL_R + 0.005)    // 5mm tolerance above rest
if (excess > 0):
    ball.vy = min(ball.vy, -excess × 20)  // proportional downward correction
```

- At 1cm excess: correction = -0.2 m/s (gentle)
- At 2cm excess: correction = -0.4 m/s (moderate)
- Only increases downward velocity, never reduces it
- Prevents the bobbing cycle that occurred with the previous hard -0.5 m/s clamp

### 5. Pit Curtain (Ball Absorption)

Activates after ball clears the pin triangle:

```
Threshold:  ball.z > LANE_L + SP × 2.6 + 0.1 = 19.18m
Action:     linearDamping = 8.0, angularDamping = 3.0
            if (vz < 0): vz = 0, vx *= 0.5  // kill backward velocity
```

The threshold is 0.1m past the last pin row (row 4 at SP × 2.598 = 0.792m past LANE_L). This ensures the ball has full physics interaction with all 10 pins before damping begins.

### 6. Floor and Wall Collider Coverage

```
Lane floor:     x: ±0.83m,  z: -2.0 to 18.29m,  thickness: 1.0m
Pin deck floor: x: ±1.07m,  z: 17.79 to 20.58m,  thickness: 1.0m
Side floors:    x: ±1.37m,  z: 17.79 to 20.58m,  thickness: 1.0m
Kickback walls: x: ±1.07m,  z: 17.79 to 20.58m,  height: 0.8m
Back wall:      x: ±1.37m,  z: 20.58m,            height: 1.0m
```

- Lane and deck floors **overlap by 0.5m** — no gap at the transition
- Floors are **1.0m thick** — prevents high-velocity tunneling
- Kickback walls contain lateral pin scatter
- Back wall prevents pins from exiting the pit
- All pin Y values remain ≥ 0 in testing (no floor penetration)

### 7. Pin Deck Friction

The deck floor collider uses friction **0.45** (dry maple) versus the lane's **0.04** (oiled pine).

- Deck zone starts 0.5m before the headpin (transition)
- Extends through the entire pit area
- Provides natural pin deceleration without artificial damping
- Pin collider friction: 0.30-0.45 depending on segment

### 8. Fallen Pin Detection

A pin is counted as "fallen" if ANY condition is true:

```
|pin.x - origin.x| > 0.05m   OR   // displaced laterally > 5cm
|pin.z - origin.z| > 0.05m   OR   // displaced forward/back > 5cm
pin.y < PIN_H/2 - 0.04m          // body center dropped > 4cm
```

- 5cm displacement threshold: ~2 base-widths (base radius = 2.6cm)
- 4cm vertical drop: catches pins tipped past ~35° from vertical
- A pin wobbling in place (1-2cm movement) is correctly counted as standing

### 9. Entry Angle Calculation

```typescript
function getPrePinFrame(): Frame {
  for (let i = 0; i < simFrames.length; i++) {
    if (simFrames[i].ball.z >= LANE_L - 0.2)
      return simFrames[Math.max(0, i - 1)];
  }
  return simFrames[0];
}
```

- Uses **forward scan** to find the first frame near the pins
- Returns the frame **before** that point (no pin-contact influence)
- Avoids the previous bug where `.filter().pop()` selected a bounce-back frame
- Entry angle: `|atan2(vx, vz)|` in degrees

### 10. Time-Based Playback

```
Physics step:      1/60 s (Rapier default)
Recording:         every 2nd step → 1 frame per 33.33ms of sim time
FRAME_DURATION:    1000/30 = 33.33ms
Playback formula:  fractionalPlayIdx += (deltaMs / 33.33) × timeScale
```

At `timeScale = 1.0`, one sim frame is consumed per 33.33ms of wall-clock time, giving **real-time playback**. The user can adjust from 0.1x (slow-motion) to 2.0x.

Frame interpolation uses `lerp` (positions) and `slerp` (quaternions) between consecutive frames for smooth sub-frame rendering.
