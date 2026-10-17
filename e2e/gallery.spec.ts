import { test } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Renders the reference pictures of the bundled scenes for the docs
 * (`pnpm docs:gallery`), each captioned with the kind of aquarium it shows and
 * a reminder that it is only a starting point: every scene is a JSON file the
 * viewer can edit. Not a test; it runs on demand like the visual project.
 */

interface SceneFile {
  readonly name: string;
  readonly tank: { readonly width: number; readonly height: number; readonly depth: number };
}

/** The kind of aquarium each bundled scene shows, for the caption. */
const KINDS: Readonly<Record<string, string>> = {
  aquaria: "Demo · the Aquaria showcase tank (a fantasy mix of sea and fresh water)",
  reef: "Open sea · tropical coral reef (saltwater)",
  "home-reef": "Aquarium · marine reef tank (saltwater)",
  "planted-tank": "Aquarium · planted community tank (freshwater)",
  iwagumi: "Aquarium · Iwagumi aquascape, stones and carpet plants (freshwater)",
};

const SIZE = { width: 1600, height: 900 };
const JPEG_QUALITY = 85;

test.use({ viewport: SIZE });

for (const [id, kind] of Object.entries(KINDS)) {
  test(`picture of the ${id} scene`, async ({ page }) => {
    const scene = JSON.parse(readFileSync(`public/scenes/${id}.json`, "utf8")) as SceneFile;
    const { width, height, depth } = scene.tank;
    await page.goto(`/?scene=${id}&frozen=8&hour=12`);
    await page.waitForFunction(() => document.body.dataset.state === "ready");

    await page.evaluate(
      ({ title, lines }) => {
        const caption = document.createElement("div");
        caption.style.cssText =
          "position:fixed;left:24px;bottom:24px;padding:14px 18px;border-radius:10px;" +
          "background:rgba(4,18,28,.72);color:#eaf6ff;font:15px/1.45 system-ui,sans-serif;" +
          "max-width:640px;box-shadow:0 4px 18px rgba(0,0,0,.35)";
        const heading = document.createElement("div");
        heading.textContent = title;
        heading.style.cssText = "font-size:22px;font-weight:600;margin-bottom:4px";
        caption.append(heading);
        for (const line of lines) {
          const row = document.createElement("div");
          row.textContent = line;
          caption.append(row);
        }
        document.body.append(caption);
      },
      {
        title: scene.name,
        lines: [
          kind,
          `Tank ${width} × ${height} × ${depth} m`,
          `Editable: scene editor (E) or public/scenes/${id}.json`,
        ],
      },
    );

    await page.screenshot({ path: `docs/scenes/${id}.jpg`, type: "jpeg", quality: JPEG_QUALITY });
  });
}
