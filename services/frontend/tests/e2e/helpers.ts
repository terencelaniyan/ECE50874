import { type Page, expect } from "@playwright/test";

const APP_LOAD_TIMEOUT_MS = 20_000;

export function matchesApiPath(url: string, apiPath: string): boolean {
  const normalizedApiPath = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  const normalizedWithProxyPrefix = `/api${normalizedApiPath}`;

  try {
    const requestUrl = new URL(url);
    return (
      requestUrl.pathname === normalizedApiPath ||
      requestUrl.pathname === normalizedWithProxyPrefix
    );
  } catch {
    return (
      url.includes(normalizedApiPath) || url.includes(normalizedWithProxyPrefix)
    );
  }
}

export async function waitForBackendReady(page: Page) {
  await expect
    .poll(
      async () => {
        const healthResponse = await page.request.get("/api/health");
        if (!healthResponse.ok()) return false;
        const healthPayload = await healthResponse.json();
        if (healthPayload?.status !== "ok") return false;

        const ballsResponse = await page.request.get("/api/balls?limit=1");
        if (!ballsResponse.ok()) return false;
        const ballsPayload = await ballsResponse.json();

        return typeof ballsPayload?.count === "number";
      },
      {
        timeout: APP_LOAD_TIMEOUT_MS,
        intervals: [500, 1_000, 2_000],
      },
    )
    .toBe(true);
}

/**
 * Wait for the app to fully load by checking the DB badge shows a ball count.
 */
export async function waitForAppLoad(page: Page) {
  await waitForBackendReady(page);
  await page.goto("/");
  await expect(page.getByText(/DB: \d+ BALLS LOADED/)).toBeVisible({
    timeout: APP_LOAD_TIMEOUT_MS,
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
