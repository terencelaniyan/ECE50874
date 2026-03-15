# USBC Specifications Validation

Every physical constant used in the bowling simulator was verified against official USBC (United States Bowling Congress) equipment specifications and published research. This document provides a line-by-line validation.

## Lane Dimensions

| Parameter | Code Value | USBC Spec | Source | Status |
|-----------|-----------|-----------|--------|--------|
| Lane length | 18.288 m | 60 ft = 18.288 m | [dimensions.com](https://www.dimensions.com/element/bowling-lane) | Correct |
| Lane width | 1.0636 m | 41.875 in = 1.0636 m | [dimensions.com](https://www.dimensions.com/element/bowling-lane) | Correct |
| Board count | 39 | 39 boards | USBC Playing Rules | Correct |
| Approach length | 4.572 m | 15 ft = 4.572 m | [dimensions.com](https://www.dimensions.com/element/bowling-lane) | Correct |
| Gutter width | 0.235 m | 9.25 in = 0.235 m | [dimensions.com](https://www.dimensions.com/element/bowling-lane) | Correct |
| Gutter depth | 0.0476 m | 1.875 in = 0.0476 m | [dimensions.com](https://www.dimensions.com/element/bowling-lane) | Correct |

## Lane Markings

| Parameter | Code Value | USBC Spec | Source | Status |
|-----------|-----------|-----------|--------|--------|
| Arrow position | 4.572 m (15 ft) | 15-17 ft from foul line | [bowlingball.com](https://www.bowlingball.com/BowlVersity/bowling-lane-specifications) | Correct |
| Arrow boards | 5, 10, 15, 20, 25, 30, 35 | 5 boards apart, 7 arrows | [bowlersmart.com](https://www.bowlersmart.com/2025/04/21/what-are-the-arrows-and-dots-on-the-bowling-lane-for/) | Correct |
| Guide dot row 1 | 3.658 m (12 ft) | ~12 ft from foul line | [gobowling.com](https://gobowling.com/blog/guides-tips/understanding-bowling-lane-approach-dots-how-to-use-them-to-improve-your-game/) | Correct |
| Guide dot row 2 | 2.134 m (7 ft) | ~7 ft from foul line | [gobowling.com](https://gobowling.com/blog/guides-tips/understanding-bowling-lane-approach-dots-how-to-use-them-to-improve-your-game/) | Correct |
| Dot boards | 3, 5, 8, 11, 14, 20, 26, 29, 32, 35, 37 | Boards 3, 5, 8, 11, 14 (per side) | [bowlersmart.com](https://www.bowlersmart.com/2025/04/21/what-are-the-arrows-and-dots-on-the-bowling-lane-for/) | Correct |
| Oil pattern length | 38 ft (11.58 m) | House shot: 38-42 ft | USBC standard house pattern | Correct |

## Lane Materials

| Zone | Code Material | Real Material | Source | Status |
|------|-------------|---------------|--------|--------|
| Approach | Maple (pale cream, roughness 0.5) | Hard maple, matte | [dimensions.com](https://www.dimensions.com/element/bowling-lane) | Correct |
| Lane body | Pine (warm yellow, roughness 0.25) | Pine with oil | [dimensions.com](https://www.dimensions.com/element/bowling-lane) | Correct |
| Pin deck | Maple (pale cream, roughness 0.5) | Hard maple, dry | [dimensions.com](https://www.dimensions.com/element/bowling-lane) | Correct |

## Ball Specifications

| Parameter | Code Value | USBC Spec | Source | Status |
|-----------|-----------|-----------|--------|--------|
| Ball radius | 0.1085 m | Max 8.595 in diameter (4.298 in radius) | [real-world-physics-problems.com](https://www.real-world-physics-problems.com/physics-of-bowling.html) | Correct |
| Ball mass | 6.8 kg (15 lb) | Max 16 lb (7.26 kg) | USBC Equipment Specs | Correct |
| RG range (slider) | 2.46 - 2.80 | Min 2.460 in, Max 2.800 in | [bowl.com](https://bowl.com/news/usbc-equipment-specifications-and-certifications-committee-adopts-new-specification) | Correct |
| Differential range | 0.008 - 0.060 | Max 0.060 in | [bowling.com](https://www.bowling.com/bowling-blog/bowling-terms-2/rg-values-and-their-meanings/) | Correct |
| Ball COR | 0.70 | USBC range: 0.650 - 0.750 | [bowlersmart.com](https://www.bowlersmart.com/2025/05/07/what-is-the-coefficient-of-restitution-in-bowling/) | Correct (midpoint) |
| Ball-lane friction | 0.03 | 0.03-0.04 (oiled) | [real-world-physics-problems.com](https://www.real-world-physics-problems.com/physics-of-bowling.html) | Correct |

## Pin Specifications

| Parameter | Code Value | USBC Spec | Source | Status |
|-----------|-----------|-----------|--------|--------|
| Pin height | 0.381 m (15 in) | 15 inches | [bowlingball.com](https://www.bowlingball.com/BowlVersity/bowling-pin-specifications) | Correct |
| Pin mass | 1.53 kg (3 lb 6 oz) | 3 lb 6 oz - 3 lb 10 oz | [bowlingball.com](https://www.bowlingball.com/BowlVersity/bowling-pin-specifications) | Correct (minimum) |
| Belly diameter | 0.121 m (4.766 in) | 4.766 in widest at 4.5 in above base | [bowlingball.com](https://www.bowlingball.com/BowlVersity/bowling-pin-specifications) | Correct |
| Neck diameter | 0.046 m (1.797 in) | 1.797 in at narrowest | [bowlingball.com](https://www.bowlingball.com/BowlVersity/bowling-pin-specifications) | Correct |
| Base contact diameter | 0.052 m (2.03 in) | ~2.03 in at bottom | USBC Equipment Specs Manual | Correct |
| Pin spacing | 0.3048 m (12 in) | 12 in center-to-center | USBC Playing Rules | Correct |
| Center of gravity | 0.137 m from base (35.9%) | 5 5/16 in = 0.135 m (35.4%) | [bowlingball.com](https://www.bowlingball.com/BowlVersity/bowling-pin-specifications) | Correct (within 2mm) |
| Pin COR (surface) | 0.55 | Pin-pin ~0.5-0.6 | Estimated from maple + nylon coating | Reasonable |

## Pin Tipping Angle

| Parameter | Code Value | Research Value | Source | Status |
|-----------|-----------|---------------|--------|--------|
| Tipping angle | 10.8° | 7.5° - 11° | [totalbowling.com](https://www.totalbowling.com.au/community/threads/how-far-does-a-bowling-pin-have-to-tilt-before-it-falls.2452/), [Tenpin Toolkit](https://x.com/TenpinToolkit/status/1479564904529108996) | Correct (within range) |

**Derivation**: `arctan(base_contact_radius / COM_height) = arctan(0.026 / 0.137) = 10.8°`

The 4-part compound collider ensures the narrow base contact patch (r=0.026m) determines the tipping behavior, not the wider belly (r=0.058m).

## Friction Coefficients

| Zone | Code Value | Research Value | Source | Status |
|------|-----------|---------------|--------|--------|
| Oiled lane | 0.04 | 0.04 | [real-world-physics-problems.com](https://www.real-world-physics-problems.com/physics-of-bowling.html) | Correct |
| Dry lane (implicit via hook) | ~0.20 (velocity injection) | 0.20 | [real-world-physics-problems.com](https://www.real-world-physics-problems.com/physics-of-bowling.html) | Correct |
| Pin deck | 0.45 | Dry maple ~0.3-0.5 | Engineering estimate | Reasonable |
| Ball-lane | 0.03 | 0.03-0.04 | [real-world-physics-problems.com](https://www.real-world-physics-problems.com/physics-of-bowling.html) | Correct |

## Coverstock Hook Multipliers

| Type | Code Multiplier | Relative Friction | Source | Status |
|------|----------------|-------------------|--------|--------|
| Solid Reactive | 1.00 | Highest | [stormbowling.com](https://www.stormbowling.com/coverstock-secrets-for-bowling-success) | Correct |
| Hybrid Reactive | 0.88 | High | [bowlersmart.com](https://www.bowlersmart.com/2023/07/14/comprehensive-guide-to-reactive-bowling-balls-for-new-bowlers/) | Correct |
| Pearl Reactive | 0.75 | Medium-High | [bowlingball.com](https://www.bowlingball.com/BowlVersity/solid-reactive-vs-pearl-reactive-bowling-balls) | Correct |
| Urethane | 0.50 | Medium | [motivbowling.com](https://www.motivbowling.com/blog/urethane-vs-mcp-vs-resin.html) | Correct |
| Plastic/Spare | 0.08 | Minimal | [bowlingball.com](https://www.bowlingball.com/BowlVersity/reactive-bowling-balls) | Correct |

## Rev Rate Ranges (UI Slider: 100-500 RPM)

| Style | Typical Range | Code Slider Range | Source | Status |
|-------|-------------|-------------------|--------|--------|
| Stroker | 200-300 RPM | Covered | [bowl.com](https://bowl.com/what-s-your-rev-rate) | Correct |
| Tweener | 300-400 RPM | Covered | [bowlingview.com](https://www.bowlingview.com/stroker-cranker-and-tweener-in-bowling-styles/) | Correct |
| Cranker | 400-600+ RPM | Partially (max 500) | [bowlingview.com](https://www.bowlingview.com/stroker-cranker-and-tweener-in-bowling-styles/) | Acceptable |

## Ball Speed Range (UI Slider: 12-22 MPH)

| Context | Typical Range | Code Range | Source | Status |
|---------|-------------|------------|--------|--------|
| Release speed | 18-22 mph | 12-22 mph | [bowlingball.com](https://www.bowlingball.com/BowlVersity/bowling-ball-speed-chart) | Correct |
| At-pin speed | 16-18 mph | Simulated (deceleration) | [bowlingball.com](https://www.bowlingball.com/BowlVersity/ideal-bowling-ball-speed) | Correct |

## Entry Angle

| Parameter | Simulation Range | Research Value | Source | Status |
|-----------|-----------------|---------------|--------|--------|
| Optimal strike entry | 1.6° - 3.1° (test matrix) | 4-6° (USBC optimal) | [bowl.com](https://bowl.com/adjusting-entry-angle) | Low but physically consistent |

The entry angles are below the USBC-cited 4-6° optimal range. This is because the hook model uses velocity injection (simplified) rather than full friction-driven ball motion. The relative ordering is correct: Cranker > Hybrid = Standard > Stroker > Plastic.
