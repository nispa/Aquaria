import type { Vector3, Vector4 } from "three";

/** An anemone as the parting sees it: where it stands and how tall it is, m. */
export interface PartingAnemone {
  readonly x: number;
  readonly z: number;
  /** Height of its base, m. */
  readonly base: number;
  readonly height: number;
}

/** A fish that may dive into an anemone. */
export interface PartingSwimmer {
  readonly position: Vector3;
  /** Body length, m. */
  readonly length: number;
}

/** Tentacles reach out this many anemone heights from its middle. */
const REACH = 1.2;
/** A fish this many anemone heights above its base still brushes the tips. */
const ABOVE = 1.5;
/** Tentacles part this many body lengths around a fish. */
const RADIUS_PER_LENGTH = 1.5;

/**
 * The fish among the tentacles of an anemone, written into `out` as
 * (x, y, z, radius) for the plant shader, which parts the tentacles around
 * them; returns how many, at most `out.length`. Allocation-free.
 */
export function partingFish(
  fish: readonly PartingSwimmer[],
  anemones: readonly PartingAnemone[],
  out: readonly Vector4[],
): number {
  let count = 0;
  for (const swimmer of fish) {
    if (count >= out.length) break;
    const { x, y, z } = swimmer.position;
    for (const anemone of anemones) {
      const reach = anemone.height * REACH;
      const across = Math.hypot(x - anemone.x, z - anemone.z);
      if (across > reach || y < anemone.base || y > anemone.base + anemone.height * ABOVE) continue;
      out[count]?.set(x, y, z, swimmer.length * RADIUS_PER_LENGTH);
      count += 1;
      break;
    }
  }
  return count;
}
