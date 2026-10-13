import type { Species, SpeciesCatalog } from "./schema";

/**
 * How large fish look on screen. The catalog keeps real sizes, but a 3 cm
 * tetra is a few pixels in a two-meter tank and a big fish can crowd it.
 * The size balance pulls every species towards a reference length set by
 * the tank: 0 keeps real sizes, 1 draws every species the same size, and in
 * between small fish grow and large ones shrink, keeping their order.
 */

/** The reference length, as a share of the tank width. */
const REFERENCE_SHARE_OF_WIDTH = 0.07;

/** Default balance: small fish become readable, large ones still dominate. */
export const DEFAULT_SIZE_BALANCE = 0.6;

/** Length every species tends to as the balance goes to 1, in meters. */
export function referenceLength(tankWidth: number): number {
  return tankWidth * REFERENCE_SHARE_OF_WIDTH;
}

function scaleSpecies(species: Species, factor: number): Species {
  return {
    ...species,
    length: {
      mean: species.length.mean * factor,
      standardDeviation: species.length.standardDeviation * factor,
    },
    // Same body lengths per second: a bigger fish must not look like slow motion.
    speed: { cruise: species.speed.cruise * factor, max: species.speed.max * factor },
  };
}

/**
 * The catalog as the simulation should see it: lengths moved towards the
 * reference on a log scale (a geometric blend), speeds scaled alike.
 *
 * @param balance 0 = real sizes .. 1 = every species at the reference length.
 */
export function displayCatalog(
  catalog: SpeciesCatalog,
  tankWidth: number,
  balance: number,
): SpeciesCatalog {
  if (balance === 0) return catalog;
  const reference = referenceLength(tankWidth);
  return {
    ...catalog,
    species: catalog.species.map((species) =>
      scaleSpecies(species, (reference / species.length.mean) ** balance),
    ),
  };
}
