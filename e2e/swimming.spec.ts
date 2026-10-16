import { test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRng } from "../src/core/rng";
import { sceneFixture } from "../src/scene/fixtures";
import { parseCatalog, parseScene } from "../src/scene/parse";
import type { SwimStyleId } from "../src/scene/swimming";
import { createSimulation } from "../src/sim/simulation";

/**
 * Draws the picture of the swimming styles for docs/SWIMMING.md
 * (`pnpm docs:gallery`): for each style, the paths of a few fish of a species
 * that swims it, seen from above, and the tail effort of one of them. It runs
 * the simulation itself, no browser rendering of the tank. Not a test; it
 * runs on demand like the rest of the gallery.
 */

/** A bundled species for each style, as assigned in public/species.json. */
const EXAMPLES: readonly (readonly [SwimStyleId, string])[] = [
  ["cruise", "blue-tang"],
  ["burst-coast", "three-bar-damsel"],
  ["hover", "royal-gramma"],
  ["glide", "moorish-idol"],
  ["patrol", "butterflyfish"],
];
const FISH_PER_STYLE = 3;
const SECONDS = 60;
const STEP = 1 / 60;
const SEED = 7;
const COLORS = ["#d1495b", "#2e4057", "#00798c"];

const PANEL = { width: 260, tank: 300, effort: 70, gap: 16 };
/** Highest tail effort drawn; posture caps it at 2.2. */
const EFFORT_SCALE = 2.2;
const OUTPUT = "docs/swimming-styles.png";

interface Trace {
  readonly paths: string[];
  readonly effort: string;
  readonly name: string;
}

function trace(style: SwimStyleId, speciesId: string): Trace {
  const catalog = parseCatalog(JSON.parse(readFileSync("public/species.json", "utf8")));
  const scene = parseScene(
    { ...sceneFixture(), fauna: [{ species: speciesId, count: FISH_PER_STYLE }] },
    catalog,
  );
  const simulation = createSimulation({ scene, catalog, rng: createRng(SEED) });
  const { width, depth } = scene.tank;
  const toPanel = (x: number, z: number) =>
    `${(((x + width / 2) / width) * PANEL.width).toFixed(1)},${((-z / depth) * PANEL.tank).toFixed(1)}`;
  const points = simulation.fish.map(() => [] as string[]);
  const effort: string[] = [];
  const steps = Math.round(SECONDS / STEP);
  for (let step = 0; step < steps; step += 1) {
    simulation.step(STEP);
    simulation.fish.forEach((fish, index) => {
      points[index]?.push(toPanel(fish.position.x, fish.position.z));
    });
    const first = simulation.fish[0];
    if (first !== undefined) {
      const x = (step / steps) * PANEL.width;
      const y = PANEL.effort * (1 - first.effort / EFFORT_SCALE);
      effort.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
  }
  const name = catalog.species.find((species) => species.id === speciesId)?.name ?? speciesId;
  if (catalog.species.find((species) => species.id === speciesId)?.swim.style !== style) {
    throw new Error(`${speciesId} no longer swims "${style}"; pick another example.`);
  }
  return { paths: points.map((path) => path.join(" ")), effort: effort.join(" "), name };
}

function panel(style: SwimStyleId, { paths, effort, name }: Trace, column: number): string {
  const lines = paths
    .map(
      (path, index) =>
        `<polyline points="${path}" fill="none" stroke="${COLORS[index % COLORS.length]}" stroke-width="1.4" stroke-linejoin="round"/>`,
    )
    .join("");
  const left = column * (PANEL.width + PANEL.gap);
  return `
    <g transform="translate(${left},0)">
      <text x="0" y="18" class="style">${style}</text>
      <text x="0" y="36" class="species">${name}</text>
      <g transform="translate(0,48)">
        <rect width="${PANEL.width}" height="${PANEL.tank}" class="tank"/>
        ${lines}
        <line x1="0" x2="${PANEL.width}" y1="0" y2="0" class="glass"/>
        <text x="6" y="14" class="note">glass</text>
        <text x="6" y="${PANEL.tank - 6}" class="note">back wall</text>
      </g>
      <g transform="translate(0,${48 + PANEL.tank + 22})">
        <text x="0" y="-6" class="note">tail effort of the red fish, ${SECONDS} s</text>
        <rect width="${PANEL.width}" height="${PANEL.effort}" class="strip"/>
        <polyline points="${effort}" fill="none" stroke="${COLORS[0]}" stroke-width="1.2"/>
      </g>
    </g>`;
}

test("picture of the swimming styles", async ({ page }) => {
  const panels = EXAMPLES.map(([style, species], column) =>
    panel(style, trace(style, species), column),
  ).join("");
  const width = EXAMPLES.length * (PANEL.width + PANEL.gap) - PANEL.gap;
  const height = 48 + PANEL.tank + 22 + PANEL.effort + 2;
  await page.setViewportSize({ width: width + 48, height: height + 48 });
  await page.setContent(`
    <style>
      body { margin: 24px; background: #fbfaf7; font-family: system-ui, sans-serif; }
      .style { font-size: 16px; font-weight: 600; fill: #1d2a33; }
      .species { font-size: 12px; fill: #5b6770; }
      .note { font-size: 10px; fill: #7a858c; }
      .tank { fill: #eef3f5; stroke: #c4cfd5; }
      .glass { stroke: #6aa9c4; stroke-width: 3; }
      .strip { fill: #fff; stroke: #d7dde1; }
    </style>
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${panels}</svg>`);
  await page.screenshot({ path: OUTPUT });
});
