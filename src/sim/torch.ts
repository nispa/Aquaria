import type { Vector3 } from "three";
import { lerp } from "../core/math";

/**
 * The viewer's torch: a beam from the glass along the line of sight through
 * the pointer, widening into the tank. Species that love light gather in it,
 * shy ones leave it (see `behavior.torch`). It tells most at night.
 */

/** The beam's radius at the glass, m, and how much it widens per meter. */
const BEAM_RADIUS_AT_GLASS = 0.15;
const BEAM_SPREAD = 0.12;
/** How much the torch still counts in full daylight. */
const DAYLIGHT_STRENGTH = 0.35;

/**
 * How far along the beam `position` lies, m, writing into `off` the offset
 * from the beam's axis to it; -1 when it lies behind the glass.
 */
export function beamOffset(
  position: Vector3,
  origin: Vector3,
  direction: Vector3,
  off: Vector3,
): number {
  off.subVectors(position, origin);
  const along = off.dot(direction);
  if (along <= 0) return -1;
  off.addScaledVector(direction, -along);
  return along;
}

/** The beam's radius this far into the tank, m. */
export function beamRadius(along: number): number {
  return BEAM_RADIUS_AT_GLASS + BEAM_SPREAD * along;
}

/** How strongly fish feel the torch at a daylight of 0 (night) .. 1 (day). */
export function torchStrength(daylight: number): number {
  return lerp(1, DAYLIGHT_STRENGTH, daylight);
}
