import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Pixel comparison of every listed scene at a fixed seed, simulated time and
 * hour of the day. Baselines depend on the browser build, so this project
 * runs on demand (`pnpm test:visual`) rather than in CI; refresh with
 * `pnpm test:visual --update-snapshots`.
 */
interface SceneIndex {
  readonly groups: readonly { readonly scenes: readonly string[] }[];
}

const sceneIndex = JSON.parse(readFileSync("public/scenes/index.json", "utf8")) as SceneIndex;
const SCENES = sceneIndex.groups.flatMap((group) => group.scenes);

for (const scene of SCENES) {
  test(`${scene} scene at 8 seconds, noon`, async ({ page }) => {
    await page.goto(`/?scene=${scene}&frozen=8&hour=12`);
    await page.waitForFunction(() => document.body.dataset.state === "ready");

    await expect(page).toHaveScreenshot(`${scene}-8s.png`, { maxDiffPixelRatio: 0.02 });
  });
}
