import { describe, it, expect } from "vitest";
import { computePhaseRatios } from "./phase-detector";

describe("computePhaseRatios", () => {
  it("skid-dominant scenario (long oil pattern)", () => {
    // Badger 52ft: skid ~52, hook ~8
    const r = computePhaseRatios(52, 8);
    expect(r.skid).toBeGreaterThan(r.hook);
    expect(r.hook).toBeGreaterThanOrEqual(0.5);
    expect(r.roll).toBeGreaterThanOrEqual(0.5);
  });

  it("balanced scenario (house shot)", () => {
    // House shot: skid ~38, hook ~22
    const r = computePhaseRatios(38, 22);
    expect(r.skid).toBeGreaterThan(r.hook);
    expect(r.hook).toBeGreaterThan(r.roll);
  });

  it("hook-heavy scenario (short pattern, aggressive ball)", () => {
    // Cheetah 33ft with big hooker: skid ~30, hook ~30
    const r = computePhaseRatios(30, 30);
    // Skid and hook should be roughly equal
    expect(Math.abs(r.skid - r.hook)).toBeLessThan(0.5);
  });

  it("all values are positive and at least 0.5", () => {
    const scenarios = [
      [0, 0],
      [60, 0],
      [0, 60],
      [30, 30],
      [50, 10],
    ] as const;
    for (const [s, h] of scenarios) {
      const r = computePhaseRatios(s, h);
      expect(r.skid).toBeGreaterThanOrEqual(0.5);
      expect(r.hook).toBeGreaterThanOrEqual(0.5);
      expect(r.roll).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("longer skid produces larger skid flex ratio", () => {
    const short = computePhaseRatios(30, 20);
    const long = computePhaseRatios(45, 10);
    expect(long.skid).toBeGreaterThan(short.skid);
  });
});
