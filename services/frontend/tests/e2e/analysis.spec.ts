import { test, expect } from "@playwright/test";
import { waitForAppLoad } from "./helpers";

test.describe("TC-13: Analysis Tab Smoke", () => {
  test("analysis tab renders uploader quickly and validates invalid upload", async ({
    page,
  }) => {
    await waitForAppLoad(page);

    const tabOpenStartMs = Date.now();
    await page.getByRole("tab", { name: "Analysis" }).click();
    await expect(page.locator(".analysis-layout")).toBeVisible();
    await expect(page.locator(".video-uploader")).toBeVisible();
    const tabOpenMs = Date.now() - tabOpenStartMs;
    expect(tabOpenMs).toBeLessThan(5_000);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "not-a-video.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("invalid video file"),
    });

    await expect(page.locator(".upload-error")).toContainText(
      "Unsupported format",
    );
  });
});
