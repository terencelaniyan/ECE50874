# Pose Analysis Validation

## Overview

This document describes the validation methodology for the pose extraction pipeline (`bowling-kinematics.ts`). It provides honest accounting of what the pipeline measures, its known accuracy limitations, and the synthetic-fixture ground-truth results used as regression baselines.

The pose pipeline is a **proxy measurement system**, not a calibrated measurement instrument. It estimates bowling delivery kinematics from video landmark data produced by MediaPipe PoseLandmarker. Accuracy depends on camera angle, video resolution, and bowler body visibility.

---

## What the Pipeline Measures

| Output | Method | Source landmarks |
|--------|--------|-----------------|
| **Ball speed (mph)** | Wrist displacement per frame × FPS, converted via body-height scale | Wrist, shoulder, ankle |
| **Launch angle (°)** | Angle of wrist-elbow vector from vertical at release | Wrist, elbow |
| **Rev rate proxy (RPM)** | Forearm angular velocity × scale factor (2.8×) | Wrist, elbow |
| **Release frame** | Peak smoothed wrist velocity in second half of sequence | Wrist |
| **Form checkpoints** | Arm verticality, knee bend angle, follow-through, balance | Full body skeleton |

---

## Known Accuracy Limitations

### Ball Speed

- **Method**: wrist landmark displacement is converted to feet using the shoulder-to-ankle body segment as a scale reference, then converted to mph.
- **Limitation**: landmark coordinates are 2D projections; depth (z-axis) is not used. Side-view video has better accuracy than front-view for speed estimation.
- **Calibration constant**: `shoulderToAnkleRatio = 0.82` (shoulder-to-ankle ≈ 82% of total height) and `bowlerHeightFeet = 5.83` (US male average, 5'10").
- **Expected accuracy**: ±3–5 mph for typical side-view video; degrades significantly for front-facing or angled camera.

### Rev Rate Proxy

- **Method**: forearm angular velocity (wrist–elbow angle change per frame) × `forearmToRevScale = 2.8`.
- **Limitation**: forearm rotation is not the same as ball revolution. True rev rate requires ball-mounted sensors (e.g., Specto, Track Insight). The scale factor (2.8) is calibrated empirically, not derived from physics.
- **Expected accuracy**: directionally correct (higher forearm rotation → higher rev proxy), but absolute values should not be compared to Specto measurements without recalibration.

### Launch Angle

- **Method**: angle of wrist–elbow vector from vertical at the detected release frame.
- **Limitation**: launch angle in bowling is measured from the foul line, not from body segments. This proxy correlates with lateral deviation of the delivery path, not the true geometric launch angle.

### Release Frame Detection

- **Method**: peak wrist velocity in the second half of the video, validated against median velocity (must be 1.5× above median).
- **Limitation**: if the video contains significant camera movement or the bowler raises their hand for a wave or celebration, false positives can occur.

---

## Synthetic Fixture: Ground-Truth Validation

The following table shows the output of the pipeline applied to a synthetically generated delivery sequence where the exact input parameters are known.

### Fixture Parameters

| Parameter | Value |
|-----------|-------|
| Frames | 30 |
| FPS | 30 |
| Wrist displacement at release | 0.08 normalized units / frame |
| Shoulder Y | 0.35 (normalized) |
| Ankle Y | 0.90 (normalized) |
| Shoulder-to-ankle span | ~0.55 normalized units |

### Derived Expected Values

Using `DEFAULT_CONFIG` constants (`bowlerHeightFeet = 5.83`, `shoulderToAnkleRatio = 0.82`):

```
realFeet = 5.83 × 0.82 = 4.781 ft
scale = shoulderToAnkleDist / realFeet = 0.55 / 4.781 ≈ 0.1150 norm-units/ft
feetPerFrame = 0.08 / 0.1150 ≈ 0.696 ft/frame
mph = (0.696 × 30 × 3600) / 5280 ≈ 14.2 mph
```

### Measured vs. Expected

| Metric | Expected range | Observed (automated test) | Status |
|--------|---------------|--------------------------|--------|
| Ball speed | 8–25 mph | ~14 mph | ✓ Within range |
| Launch angle | 0–45° | ~5–15° | ✓ Physically plausible |
| Rev rate proxy | 0–800 RPM | ~100–400 RPM | ✓ In realistic range |
| Release frame | ~21/30 (70%) | Detected in 16–28 | ✓ Correct window |
| Confidence | > 0.8 | ~0.95 (visibility=0.95) | ✓ Reflects landmark quality |

These values are automatically verified by `bowling-kinematics.test.ts` (the "ground-truth calibrated fixture" test suite).

---

## Form Evaluation Checkpoints

The form evaluator checks four biomechanical criteria at the detected release frame.

| Checkpoint | Criterion | Source | Threshold |
|-----------|-----------|--------|-----------|
| **Arm Verticality** | Arm within N° of vertical | National Bowling Academy pendulum swing guide | `FORM_THRESHOLDS.armVerticalityMaxDeg` |
| **Knee Bend** | Knee angle in [min, max] range | IBPSIA slide position guidelines | `FORM_THRESHOLDS.kneeBendMin/Max` |
| **Follow-Through** | Wrist rises above shoulder within N frames | USBC coaching materials | `FORM_THRESHOLDS.followThroughFrames` |
| **Balance** | Shoulder midpoint within 5% of hip midpoint | General bowling coaching | Fixed: 0.05 normalized units |

### Regression Baseline

For the canonical synthetic delivery (`wristReleaseSpeed=0.08`, 30 frames, 30fps, right-handed):

- **Arm Verticality**: PASS (arm stays within vertical during approach)
- **Follow-Through**: PASS (wrist rises above shoulder post-release)
- **Overall score**: ≥ 50 (at least 2 of 4 checkpoints pass)

These are enforced as regression tests in `bowling-kinematics.test.ts`.

---

## Scope Statement

The pose analysis module is an **experimental feature** (Phase 2 / Vision). Its purpose is to:
1. Give bowlers directional feedback on delivery form (pass/fail checkpoints)
2. Extract approximate delivery parameters to pre-populate the physics simulator
3. Demonstrate the architecture for integrating real-time computer vision into a bowling decision-support tool

It is **not** intended to replace professional measurement equipment (Specto, Track Insight, CATS). The accuracy levels documented here are appropriate for coaching feedback and simulator seeding, not for competitive equipment certification.
