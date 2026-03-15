import { test, expect } from "@playwright/test";
import { waitForAppLoad } from "./helpers";

test.describe("TC-01: Application Loads (Smoke Test)", () => {
  test("page loads with header, DB badge, and default Grid View tab", async ({
    page,
  }) => {
    await waitForAppLoad(page);

    // Header title visible
    await expect(page.locator(".logo")).toContainText("BBG");

    // DB badge shows ball count (should be 1360 for seeded DB)
    await expect(page.getByText(/DB: \d+ BALLS LOADED/)).toBeVisible();

    // Grid View tab is active by default
    const gridTab = page.getByRole("tab", { name: "Grid View" });
    await expect(gridTab).toHaveAttribute("aria-selected", "true");

    // Arsenal panel heading visible
    await expect(page.getByText("My Arsenal")).toBeVisible();

    // Arsenal shows 0 / 6 SLOTS
    await expect(page.getByText("0 / 6 SLOTS")).toBeVisible();
  });

  test("all four navigation tabs are present", async ({ page }) => {
    await waitForAppLoad(page);

    await expect(page.getByRole("tab", { name: "Grid View" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Catalog" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Simulation" })).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Ball Database" }),
    ).toBeVisible();
  });
});
