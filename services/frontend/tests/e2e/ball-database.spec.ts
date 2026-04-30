import { test, expect } from "@playwright/test";
import { waitForAppLoad, goToDatabase } from "./helpers";

test.describe("TC-10: Ball Database View", () => {
  test("database tab loads table, supports search/filter, and paginates", async ({
    page,
  }) => {
    await waitForAppLoad(page);
    await goToDatabase(page);

    await expect(page.locator(".db-view")).toBeVisible();
    await expect(page.locator("#db-heading")).toContainText("Ball Database");
    await expect(page.locator(".db-table")).toBeVisible({ timeout: 10_000 });

    const countText = await page.locator(".db-count").textContent();
    const initialCountMatch = countText?.match(/(\d+)/);
    const initialCount = Number(initialCountMatch?.[1] ?? "0");
    expect(initialCount).toBeGreaterThan(0);

    const searchInput = page.getByRole("searchbox", { name: "Search balls" });
    await searchInput.fill("storm");
    await expect(page.locator(".db-table tbody tr").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.locator(".filter-btn", { hasText: "Pearl" }).click();
    await expect(
      page.locator(".filter-btn.active", { hasText: "Pearl" }),
    ).toBeVisible();
    await expect(page.locator(".db-table tbody tr").first()).toBeVisible({
      timeout: 10_000,
    });

    await searchInput.fill("");
    await page.locator(".filter-btn", { hasText: "All" }).click();
    await expect(page.locator(".filter-btn.active", { hasText: "All" })).toBeVisible();

    const nextButton = page.locator(".db-page-btn", { hasText: "Next" });
    const previousButton = page.locator(".db-page-btn", { hasText: "Previous" });

    await expect(previousButton).toBeDisabled();
    await expect(page.locator(".db-page-info")).toContainText("of");

    if (await nextButton.isEnabled()) {
      const firstRowBefore = await page
        .locator(".db-table tbody tr")
        .first()
        .textContent();
      await nextButton.click();
      await expect(previousButton).toBeEnabled();
      await expect(page.locator(".db-page-info")).toContainText("of");
      await expect
        .poll(async () => {
          const firstRowAfter = await page
            .locator(".db-table tbody tr")
            .first()
            .textContent();
          return firstRowAfter !== firstRowBefore;
        })
        .toBe(true);
    }
  });
});
