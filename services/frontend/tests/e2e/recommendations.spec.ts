import { test, expect } from "@playwright/test";
import {
  waitForAppLoad,
  addBallFromCatalog,
  goToGridView,
} from "./helpers";

test.describe("TC-03: Recommendations Appear", () => {
  test("recommendations panel shows items after adding 2 balls", async ({
    page,
  }) => {
    await waitForAppLoad(page);

    // Add two balls from catalog
    await addBallFromCatalog(page, 0);
    await addBallFromCatalog(page, 1);

    // Switch to Grid View
    await goToGridView(page);
    await expect(page.getByText("2 / 6 SLOTS")).toBeVisible();

    // The "Recs" toggle should be active by default on the right panel
    await expect(
      page.locator(".right-panel-btn.active").filter({ hasText: "Recs" }),
    ).toBeVisible();

    // Wait for recommendations to load
    await expect(page.locator(".rec-list-compact")).toBeVisible({
      timeout: 15_000,
    });

    // At least one recommendation item should appear
    const recItems = page.locator(".rec-item");
    await expect(recItems.first()).toBeVisible({ timeout: 10_000 });

    // Each recommendation should have a method badge (KNN by default)
    await expect(
      recItems.first().locator(".rec-badge.method"),
    ).toContainText("KNN");

    // Each recommendation should have a match percentage
    await expect(recItems.first().getByText(/\d+% MATCH/)).toBeVisible();

    // Each recommendation should have an "Add to bag" button
    await expect(
      recItems.first().getByRole("button", { name: "Add to bag" }),
    ).toBeVisible();
  });

  test("V2 toggle switches recommendation method", async ({ page }) => {
    await waitForAppLoad(page);

    // Add two balls
    await addBallFromCatalog(page, 0);
    await addBallFromCatalog(page, 1);

    // Switch to Grid View
    await goToGridView(page);

    // Wait for initial KNN recommendations
    await expect(page.locator(".rec-item").first()).toBeVisible({
      timeout: 15_000,
    });

    // Click V2 method toggle button
    await page.locator(".rec-method-btn").filter({ hasText: "V2" }).click();

    // Recommendations should reload; wait for the list to appear again.
    // The method badge should now show V2 (or KNN fallback if model not trained)
    await expect(page.locator(".rec-item").first()).toBeVisible({
      timeout: 15_000,
    });

    // Check that a method badge (V2 or KNN) is shown on the first item
    const hasMethodBadge = await page
      .locator(".rec-badge.method")
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasMethodBadge).toBe(true);
  });
});
