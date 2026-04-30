import { test, expect } from "@playwright/test";
import { waitForAppLoad, addBallFromCatalog, goToGridView } from "./helpers";

test.describe("TC-12: Grid Voronoi Interactions", () => {
  test("grid renders Voronoi cells and hover interactions", async ({ page }) => {
    await waitForAppLoad(page);

    await addBallFromCatalog(page, 0);
    await addBallFromCatalog(page, 1);
    await goToGridView(page);
    await expect(page.getByText("2 / 6 SLOTS")).toBeVisible();

    const gridSvg = page.locator(".grid-view-svg");
    await expect(gridSvg).toBeVisible();

    const voronoiCells = page.locator(".grid-view-cell");
    await expect(voronoiCells.first()).toBeVisible();
    await expect(voronoiCells).toHaveCount(2);

    const interactivePoints = page.locator('.grid-view-svg g[role="img"]');
    await expect(interactivePoints.first()).toBeVisible();

    await interactivePoints.first().hover();
    await expect(page.getByText(/RG\s+\d+\.\d+\s+·\s+Diff\s+\d+\.\d+/)).toBeVisible();

    const coverageOrGap = page
      .locator(".gap-indicator, .gap-callout-banner")
      .first();
    await expect(coverageOrGap).toBeVisible();
  });
});
