import { test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

/**
 * Renders the square pictures of the scene cards in the control panel
 * (`pnpm docs:gallery`): one per bundled scene, in
 * public/scenes/thumbnails/<id>.jpg. Not a test; it runs on demand like the
 * visual project. A new bundled scene needs its picture.
 */

interface SceneIndexFile {
  readonly groups: readonly { readonly scenes: readonly string[] }[];
}

const SIZE = 360;
const JPEG_QUALITY = 80;
const FOLDER = "public/scenes/thumbnails";

const index = JSON.parse(readFileSync("public/scenes/index.json", "utf8")) as SceneIndexFile;

test.use({ viewport: { width: SIZE, height: SIZE } });

test.beforeAll(() => {
  mkdirSync(FOLDER, { recursive: true });
});

for (const id of index.groups.flatMap((group) => group.scenes)) {
  test(`scene card picture of ${id}`, async ({ page }) => {
    await page.addInitScript((height) => {
      localStorage.setItem(
        "aquaria.settings",
        JSON.stringify({ renderHeight: height, autoResolution: false }),
      );
    }, SIZE * 2);
    await page.goto(`/?scene=${id}&frozen=8&hour=12`);
    await page.waitForFunction(() => document.body.dataset.state === "ready");

    await page.screenshot({ path: `${FOLDER}/${id}.jpg`, type: "jpeg", quality: JPEG_QUALITY });
  });
}
