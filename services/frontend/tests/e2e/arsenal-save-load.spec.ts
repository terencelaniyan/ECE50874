import { test, expect } from "@playwright/test";
import {
  waitForAppLoad,
  addBallFromCatalog,
  goToGridView,
  matchesApiPath,
} from "./helpers";

test.describe("TC-11: Save and Load Arsenal", () => {
  test("save arsenal, clear bag, then load arsenal", async ({ page }) => {
    await waitForAppLoad(page);

    const firstBall = await addBallFromCatalog(page, 0);
    const secondBall = await addBallFromCatalog(page, 1);
    await goToGridView(page);
    await expect(page.getByText("2 / 6 SLOTS")).toBeVisible();

    const arsenalName = `pw-arsenal-${Date.now()}`;
    const createArsenalResponsePromise = page.waitForResponse((response) => {
      return (
        response.request().method() === "POST" &&
        matchesApiPath(response.url(), "/arsenals")
      );
    });

    await page.locator(".arsenal-save-load-btn", { hasText: "Save" }).click();
    await page.locator(".virtual-bag-input").fill(arsenalName);
    await page
      .locator(".arsenal-modal-actions button", { hasText: "Save" })
      .click();

    const createArsenalResponse = await createArsenalResponsePromise;
    expect(createArsenalResponse.ok()).toBe(true);

    await page.locator(".arsenal-save-load-btn", { hasText: "Clear All" }).click();
    await expect(page.getByText("0 / 6 SLOTS")).toBeVisible();

    const listArsenalsResponsePromise = page.waitForResponse((response) => {
      return (
        response.request().method() === "GET" &&
        matchesApiPath(response.url(), "/arsenals")
      );
    });

    await page.locator(".arsenal-save-load-btn", { hasText: "Load" }).click();
    const listArsenalsResponse = await listArsenalsResponsePromise;
    expect(listArsenalsResponse.ok()).toBe(true);

    const loadArsenalResponsePromise = page.waitForResponse((response) => {
      return (
        response.request().method() === "GET" &&
        /\/arsenals\/[^/]+$/.test(new URL(response.url()).pathname)
      );
    });

    await page
      .locator(".arsenal-load-list button")
      .filter({ hasText: arsenalName })
      .first()
      .click();

    const loadArsenalResponse = await loadArsenalResponsePromise;
    expect(loadArsenalResponse.ok()).toBe(true);

    await expect(page.getByText("2 / 6 SLOTS")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".arsenal-card-name", { hasText: firstBall })).toBeVisible();
    await expect(page.locator(".arsenal-card-name", { hasText: secondBall })).toBeVisible();
  });
});
