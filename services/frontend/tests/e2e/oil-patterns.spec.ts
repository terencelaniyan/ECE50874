import { test, expect } from "@playwright/test";

test.describe("TC-09: Oil Patterns API", () => {
  test("GET /oil-patterns returns patterns with friction zones", async ({
    request,
  }) => {
    const res = await request.get("http://localhost:8000/oil-patterns");
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data.items).toBeDefined();
    expect(data.items.length).toBeGreaterThanOrEqual(4);

    // Each pattern has required fields
    for (const pattern of data.items) {
      expect(pattern.name).toBeTruthy();
      expect(pattern.length_ft).toBeGreaterThan(0);
      expect(pattern.zones).toBeDefined();
      expect(pattern.zones.length).toBeGreaterThanOrEqual(2);

      // Each zone has friction coefficients
      for (const zone of pattern.zones) {
        expect(zone.startFt).toBeGreaterThanOrEqual(0);
        expect(zone.endFt).toBeGreaterThan(zone.startFt);
        expect(zone.mu).toBeGreaterThan(0);
      }
    }

    // Oil zone should have low friction, dry zone higher
    const houseShot = data.items.find((p: any) => p.name.includes("House"));
    expect(houseShot).toBeDefined();
    const oilZone = houseShot.zones[0];
    const dryZone = houseShot.zones[1];
    expect(oilZone.mu).toBeLessThan(dryZone.mu);
  });
});
