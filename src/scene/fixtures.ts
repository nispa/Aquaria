import type { SpeciesCatalogInput, SceneInput } from "./schema";

/** Minimal valid fixtures shared by scene tests. Tests override single fields. */
export function catalogFixture(): SpeciesCatalogInput {
  return {
    species: [
      {
        id: "blue-tang",
        name: "Blue tang",
        body: { type: "procedural", shape: "disc", colors: { base: "#1f5fd6", accent: "#ffd23f" } },
        length: { mean: 0.25, standardDeviation: 0.03 },
        speed: { cruise: 0.35, max: 0.9 },
        schooling: 0.3,
        bands: [1, 3],
        heightRange: [0.3, 0.8],
      },
      {
        id: "sardine",
        name: "Sardine",
        body: {
          type: "procedural",
          shape: "slender",
          colors: { base: "#9fb4c7", accent: "#e9f1f7" },
        },
        length: { mean: 0.12, standardDeviation: 0.01 },
        speed: { cruise: 0.6, max: 1.4 },
        schooling: 1,
        bands: [2, 4],
        heightRange: [0.4, 0.9],
      },
    ],
  };
}

export function sceneFixture(): SceneInput {
  return {
    id: "reef",
    name: "Tropical reef",
    seed: 1234,
    tank: { width: 8, height: 4.5, depth: 5 },
    water: { color: "#0a4f6e", fogDensity: 0.12 },
    light: { color: "#fff6e0", intensity: 1.2, caustics: { intensity: 0.8, scale: 1.5 } },
    current: { direction: [1, 0, 0], strength: 0.05, turbulence: 0.3 },
    backdrop: { type: "gradient", top: "#0e6c8f", bottom: "#021b2b" },
    floor: { color: "#c9b48a" },
    flora: [{ kind: "kelp", count: 12, bands: [2, 4], height: [1, 3], color: "#3d7a3a" }],
    props: [{ kind: "starfish", count: 1, color: "#e8683c" }],
    fauna: [
      { species: "blue-tang", count: 6 },
      { species: "sardine", count: 40 },
    ],
  };
}
