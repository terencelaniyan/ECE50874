import { type Page, expect } from "@playwright/test";

/**
 * Wait for the app to fully load by checking the DB badge shows a ball count.
 */
export async function waitForAppLoad(page: Page) {
  await page.goto("/");
  await expect(page.getByText(/DB: \d+ BALLS LOADED/)).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Navigate to the Catalog tab, wait for balls to load, and click "Add to bag"
 * on the Nth available ball card (0-indexed). Returns the name of the added ball.
 */
export async function addBallFromCatalog(
  page: Page,
  index = 0,
): Promise<string> {
  // Switch to Catalog tab
  await page.getByRole("tab", { name: "Catalog" }).click();

  // Wait for ball cards to appear (loading finishes)
  await expect(page.locator(".ball-card").first()).toBeVisible({
    timeout: 10_000,
  });

  // Get the ball name before clicking
  const card = page.locator(".ball-card").nth(index);
  const nameEl = card.locator("strong");
  const ballName = (await nameEl.textContent()) ?? "";

  // Click "Add to bag" on that card
  await card.getByRole("button", { name: "Add to bag" }).click();

  return ballName.trim();
}

/**
 * Navigate to Grid View tab.
 */
export async function goToGridView(page: Page) {
  await page.getByRole("tab", { name: "Grid View" }).click();
}

/**
 * Navigate to Simulation tab.
 */
export async function goToSimulation(page: Page) {
  await page.getByRole("tab", { name: "Simulation" }).click();
}

/**
 * Navigate to Ball Database tab.
 */
export async function goToDatabase(page: Page) {
  await page.getByRole("tab", { name: "Ball Database" }).click();
}
