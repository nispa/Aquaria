import { expect, test } from "@playwright/test";

/**
 * Pixel comparison of a fixed seed at a fixed simulated time. Baselines depend
 * on the browser build, so this project runs on demand (`pnpm test:visual`)
 * rather than in CI; refresh with `pnpm test:visual --update-snapshots`.
 */
test("reef scene at 8 seconds", async ({ page }) => {
  await page.goto("/?frozen=8");
  await page.waitForFunction(() => document.body.dataset.state === "ready");

  await expect(page).toHaveScreenshot("reef-8s.png", { maxDiffPixelRatio: 0.02 });
});
