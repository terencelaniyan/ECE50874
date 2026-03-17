import { test, expect } from "@playwright/test";
import { waitForAppLoad, addBallFromCatalog, goToGridView } from "./helpers";

test.describe("TC-02: Add Ball from Catalog", () => {
  test("add first ball from catalog and verify it appears in arsenal", async ({
    page,
  }) => {
    await waitForAppLoad(page);

    // Navigate to Catalog
    await page.getByRole("tab", { name: "Catalog" }).click();

    // Catalog heading and search bar visible
    await expect(page.getByText("Ball Catalog")).toBeVisible();
    await expect(
      page.getByRole("searchbox", { name: "Search balls" }),
    ).toBeVisible();

    // Wait for ball cards to load
    await expect(page.locator(".ball-card").first()).toBeVisible({
      timeout: 10_000,
    });

    // Count of balls shown
    await expect(page.getByText(/\d+ balls?/)).toBeVisible();

    // Click "Add to bag" on the first ball card
    const firstCard = page.locator(".ball-card").first();
    const ballName = await firstCard.locator("strong").textContent();
    await firstCard.getByRole("button", { name: "Add to bag" }).click();

    // The button on that card should now say "In bag"
    await expect(
      firstCard.getByRole("button", { name: "In bag" }),
    ).toBeVisible();

    // Switch to Grid View and verify ball appears in arsenal
    await goToGridView(page);
    await expect(page.getByText("1 / 6 SLOTS")).toBeVisible();

    // The ball name should appear in the arsenal panel
    if (ballName) {
      await expect(page.locator(".arsenal-card-name").first()).toContainText(
        ballName.trim(),
      );
    }
  });

  test("add two balls from catalog and verify bag count", async ({ page }) => {
    await waitForAppLoad(page);

    // Add first ball
    await addBallFromCatalog(page, 0);
    // Add second ball
    await addBallFromCatalog(page, 1);

    // Switch to Grid View
    await goToGridView(page);

    // Should show 2 / 6 SLOTS
    await expect(page.getByText("2 / 6 SLOTS")).toBeVisible();
  });
});
