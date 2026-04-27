import { test, expect } from "@playwright/test";
import {
  waitForAppLoad,
  addBallFromCatalog,
} from "./helpers";

test.describe("TC-08: 3D Lane Simulation", () => {
  test("3D sim tab loads, runs simulation, and shows results", async ({
    page,
  }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    await waitForAppLoad(page);

    // Add a ball from catalog
    await addBallFromCatalog(page, 0);

    // Navigate to 3D Sim tab
    await page.getByRole("tab", { name: "3D Sim" }).click();
    await page.waitForTimeout(500);

    // 3D simulation title visible
    await expect(page.getByText("3D Lane Simulation")).toBeVisible({ timeout: 5_000 });

    // Canvas should be rendered
    await expect(page.locator(".sim3d-canvas")).toBeVisible();

    // Camera buttons should be present
    await expect(page.getByRole("button", { name: "TOP" })).toBeVisible();

    // Wait for physics worker to be ready
    // Button starts as "Loading physics..." (disabled), becomes "LAUNCH BALL" (enabled)
    const launchBtn = page.locator(".sim-btn");
    const physicsInitStartMs = Date.now();
    await expect(launchBtn).toBeEnabled({ timeout: 20_000 });
    await expect(launchBtn).toContainText("LAUNCH BALL");
    const physicsInitMs = Date.now() - physicsInitStartMs;
    expect(physicsInitMs).toBeLessThan(20_000);

    // Click LAUNCH BALL
    const launchStartMs = Date.now();
    await launchBtn.click();

    // Wait for results card (simulation takes a moment)
    await expect(page.getByText("Simulation Results").first()).toBeVisible({
      timeout: 15_000,
    });
    const launchToResultsMs = Date.now() - launchStartMs;
    expect(launchToResultsMs).toBeLessThan(15_000);

    // Verify key results
    await expect(page.getByText("Entry Angle", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Outcome", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Total Time", { exact: true })).toBeVisible();
  });
});
