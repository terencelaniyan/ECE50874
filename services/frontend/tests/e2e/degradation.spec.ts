import { test, expect } from "@playwright/test";
import {
  waitForAppLoad,
  addBallFromCatalog,
  goToGridView,
} from "./helpers";

test.describe("TC-07: Degradation V2 Toggle", () => {
  test("switching to V2 degradation model updates health bars with (LOG) label", async ({
    page,
  }) => {
    await waitForAppLoad(page);

    // Add a ball so the arsenal has content
    await addBallFromCatalog(page, 0);

    // Switch to Grid View
    await goToGridView(page);
    await expect(page.getByText("1 / 6 SLOTS")).toBeVisible();

    // Verify V1 is active by default in the degradation toggle
    await expect(
      page.locator(".deg-toggle-btn.active").filter({ hasText: "V1" }),
    ).toBeVisible();

    // Health bar should be visible without (LOG) indicator
    await expect(page.getByText("Coverstock Health")).toBeVisible();
    await expect(page.locator(".deg-model-indicator")).not.toBeVisible();

    // Click V2 degradation toggle
    await page.locator(".deg-toggle-btn").filter({ hasText: "V2" }).click();

    // V2 should now be active
    await expect(
      page.locator(".deg-toggle-btn.active").filter({ hasText: "V2" }),
    ).toBeVisible();

    // Wait for V2 data to load — the (LOG) indicator should appear
    await expect(page.locator(".deg-model-indicator")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator(".deg-model-indicator")).toContainText("(LOG)");

    // Lambda indicator should appear for V2 model
    await expect(page.locator(".lambda-indicator").first()).toBeVisible();
  });
});
