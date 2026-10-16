import { test } from "@playwright/test";

/**
 * Renders the pictures at the top of the README (`pnpm docs:gallery`): the
 * open reef with most effects on, and a reef tank with the `A` overlay
 * showing what every fish is doing. Not a test; it runs on demand like the
 * visual project.
 */

const SIZE = { width: 1600, height: 900 };
const JPEG_QUALITY = 85;
/** Most effects: the look the README's first picture shows off. */
const RICH_LOOK = [
  "caustics",
  "shadows",
  "reflections",
  "refractive-bubbles",
  "fluorescence",
  "ambient-occlusion",
  "volumetric-light",
  "depth-of-field",
  "bloom",
  "finish",
  "smaa",
].join(",");
/** Lets the fish settle into what they do before the overlay is shown, ms. */
const SETTLE_MS = 8000;

test.use({ viewport: SIZE });

test.beforeEach(async ({ page }) => {
  // A software renderer is slow: keep the full resolution for the picture.
  await page.addInitScript((height) => {
    localStorage.setItem(
      "aquaria.settings",
      JSON.stringify({ renderHeight: height, autoResolution: false }),
    );
  }, SIZE.height);
});

test("README picture: the open reef with most effects on", async ({ page }) => {
  await page.goto(`/?scene=reef&frozen=10&hour=12&effects=${RICH_LOOK}`);
  await page.waitForFunction(() => document.body.dataset.state === "ready");

  await page.screenshot({
    path: "docs/screenshot-realistic.jpg",
    type: "jpeg",
    quality: JPEG_QUALITY,
  });
});

test("README picture: what the fish are doing, with A", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/?scene=home-reef&hour=12");
  await page.waitForFunction(() => document.body.dataset.state === "ready");
  await page.waitForTimeout(SETTLE_MS);

  await page.keyboard.press("a");
  // The card goes to the fish nearest the pointer.
  await page.mouse.move(SIZE.width * 0.45, SIZE.height * 0.42);
  await page.waitForTimeout(1500);

  await page.screenshot({ path: "docs/screenshot.jpg", type: "jpeg", quality: JPEG_QUALITY });
});
