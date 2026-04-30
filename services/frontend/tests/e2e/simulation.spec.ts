import { test, expect } from "@playwright/test";
import {
  waitForAppLoad,
  addBallFromCatalog,
  goToSimulation,
} from "./helpers";

test.describe("TC-06: Lane Simulation", () => {
  test("run simulation and verify results card with entry angle and advice", async ({
    page,
  }) => {
    await waitForAppLoad(page);

    // Add a ball so the simulation dropdown has a real ball
    await addBallFromCatalog(page, 0);

    // Navigate to Simulation tab
    await goToSimulation(page);

    // Lane simulation title visible
    await expect(page.getByText("Lane Simulation (Top View)")).toBeVisible();

    // Phase label starts at READY
    await expect(page.locator("#phase-label")).toContainText("READY");

    // Lane SVG should be rendered
    await expect(page.locator(".lane-svg")).toBeVisible();

    // Ball select dropdown should be present (not "No balls in bag")
    const ballSelect = page.locator("#sim-ball-select");
    await expect(ballSelect).toBeVisible();
    const selectText = await ballSelect.inputValue();
    expect(selectText).not.toBe("No balls in bag");

    // Oil pattern dropdown should be present
    await expect(page.locator("#oil-pattern")).toBeVisible();

    // Select an oil pattern
    await page
      .locator("#oil-pattern")
      .selectOption("Sport Shot — Badger (52ft)");

    // Click LAUNCH BALL
    const launchStartMs = Date.now();
    await page.getByRole("button", { name: "LAUNCH BALL" }).click();

    // Phase label should change to "SIMULATING..."
    await expect(page.locator("#phase-label")).toContainText("SIMULATING");

    // Wait for results card to appear (simulation takes ~2 seconds)
    await expect(page.getByText("Simulation Results")).toBeVisible({
      timeout: 10_000,
    });
    const launchToResultsMs = Date.now() - launchStartMs;
    expect(launchToResultsMs).toBeLessThan(10_000);

    // Verify key result rows (exact match to avoid hitting advice text)
    await expect(page.getByText("Entry Angle", { exact: true })).toBeVisible();
    await expect(page.getByText("Breakpoint", { exact: true })).toBeVisible();
    await expect(page.getByText("Skid Length", { exact: true })).toBeVisible();
    await expect(page.getByText("Hook Distance", { exact: true })).toBeVisible();
    await expect(page.getByText("Outcome", { exact: true })).toBeVisible();

    // Advice card should appear
    await expect(page.locator(".advice-card")).toBeVisible();
    await expect(page.locator(".advice-summary")).toBeVisible();

    // Phase label should show final result (either "STRIKE LINE" or "LIGHT HIT")
    const finalPhase = await page.locator("#phase-label").textContent();
    expect(
      finalPhase?.includes("STRIKE LINE") || finalPhase?.includes("LIGHT HIT"),
    ).toBe(true);
  });
});
