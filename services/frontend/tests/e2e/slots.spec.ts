import { test, expect } from "@playwright/test";
import {
  waitForAppLoad,
  addBallFromCatalog,
  goToGridView,
  matchesApiPath,
} from "./helpers";

test.describe("TC-05: Slot Assignment Panel", () => {
  test("switching to Slots panel shows slot assignments with silhouette score", async ({
    page,
  }) => {
    await waitForAppLoad(page);

    // Add two balls to have enough data for slot assignments
    await addBallFromCatalog(page, 0);
    await addBallFromCatalog(page, 1);

    // Switch to Grid View
    await goToGridView(page);
    await expect(page.getByText("2 / 6 SLOTS")).toBeVisible();

    // Click the "Slots" toggle on the right panel
    const slotsResponsePromise = page.waitForResponse((response) => {
      return (
        response.request().method() === "POST" &&
        matchesApiPath(response.url(), "/slots")
      );
    });
    await page.locator(".right-panel-btn").filter({ hasText: "Slots" }).click();

    // The right panel badge should now say "6-BALL"
    await expect(
      page.locator(".recs-panel-wrap .panel-badge").filter({ hasText: "6-BALL" }),
    ).toBeVisible();

    // Wait for slot panel content to load
    await expect(page.locator(".slot-panel")).toBeVisible({ timeout: 10_000 });
    const slotsResponse = await slotsResponsePromise;
    expect(slotsResponse.ok()).toBe(true);
    const slotsPayload = await slotsResponse.json();
    expect(Array.isArray(slotsPayload.assignments)).toBe(true);
    expect(slotsPayload.assignments.length).toBeGreaterThanOrEqual(1);
    expect(slotsPayload).toHaveProperty("silhouette_score");
    expect(Array.isArray(slotsPayload.slot_coverage)).toBe(true);

    // Silhouette score should be displayed
    await expect(page.getByText("SILHOUETTE SCORE")).toBeVisible();
    await expect(page.locator(".slot-silhouette-val")).toBeVisible();

    // The 6-slot grid should render
    const slotCards = page.locator(".slot-card");
    await expect(slotCards).toHaveCount(6);

    // At least one slot should be covered (has a ball assigned)
    const coveredSlots = page.locator(".slot-card.covered");
    expect(await coveredSlots.count()).toBeGreaterThanOrEqual(1);
  });
});
