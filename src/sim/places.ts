import type { Box3, Vector3 } from "three";
import type { Rng } from "../core/rng";
import type { Plant, Prop } from "./layout";
import { propTop } from "./obstacles";
import type { SeabedHeight } from "./steering";

/**
 * Places: the plants and objects of the scenery that mean something to a
 * fish, by their tags (see scene/tags). Swimming styles and activities look
 * them up by tag, e.g. a clownfish keeps station over the nearest `anemone`.
 */

export interface Place {
  readonly x: number;
  readonly z: number;
  /** Height of the top above the place's base, m. */
  readonly height: number;
  readonly tags: readonly string[];
}

/** The places of a laid-out scenery: every plant and prop with at least one tag. */
export function placesOf(plants: readonly Plant[], props: readonly Prop[]): Place[] {
  return [
    ...plants.map(({ x, z, height, tags }) => ({ x, z, height, tags })),
    ...props.map(({ kind, x, z, size, tags }) => ({ x, z, height: propTop(kind, size), tags })),
  ].filter((place) => place.tags.length > 0);
}

/** Looks up places by tag. */
export interface PlaceFinder {
  /**
   * Writes into `top` the top of the place tagged `tag` nearest to `from`
   * (seen from above) and returns true, or returns false when there is none.
   */
  nearest(tag: string, from: Vector3, top: Vector3): boolean;
  /**
   * Picks at random a place within `radius` of `from` (seen from above)
   * whose top lies in `within`, favouring places that interest the fish
   * most (`interests`: 0..1 by tag, a place counts its best tag) and those
   * closest. Writes its top into `top` and returns its height, or returns -1
   * when no place qualifies. Meant for when a fish chooses what to do next,
   * not for every frame.
   */
  pick(
    interests: Readonly<Record<string, number>>,
    from: Vector3,
    radius: number,
    within: Box3,
    rng: Rng,
    top: Vector3,
  ): number;
}

/** The height of the last place `appeal` accepts, leaving its top written. */
function lastQualifying(places: readonly Place[], appeal: (place: Place) => number): number {
  for (let index = places.length - 1; index >= 0; index -= 1) {
    const place = places[index];
    if (place !== undefined && appeal(place) > 0) return place.height;
  }
  return -1;
}

/** How much a place interests a fish: its best tag. */
function interestIn(place: Place, interests: Readonly<Record<string, number>>): number {
  let best = 0;
  for (const tag of place.tags) best = Math.max(best, interests[tag] ?? 0);
  return best;
}

/**
 * Finds places among the current ones. The base of a place is the seabed
 * under it, so places on rockwork stand on the rock.
 */
export function createPlaceFinder(
  places: () => readonly Place[],
  seabed: SeabedHeight,
): PlaceFinder {
  return {
    nearest(tag, from, top) {
      let best: Place | undefined;
      let bestDistance = Infinity;
      for (const place of places()) {
        if (!place.tags.includes(tag)) continue;
        const distance = Math.hypot(place.x - from.x, place.z - from.z);
        if (distance < bestDistance) {
          best = place;
          bestDistance = distance;
        }
      }
      if (best === undefined) return false;
      top.set(best.x, seabed(best.x, best.z) + best.height, best.z);
      return true;
    },
    pick(interests, from, radius, within, rng, top) {
      // The appeal of a place: its interest, halved at one radius away.
      const appeal = (place: Place): number => {
        const distance = Math.hypot(place.x - from.x, place.z - from.z);
        if (distance > radius) return 0;
        const interest = interestIn(place, interests);
        if (interest === 0) return 0;
        top.set(place.x, seabed(place.x, place.z) + place.height, place.z);
        return within.containsPoint(top) ? interest / (1 + distance / radius) : 0;
      };
      const current = places();
      let total = 0;
      for (const place of current) total += appeal(place);
      if (total === 0) return -1;
      let draw = rng.next() * total;
      for (const place of current) {
        const share = appeal(place);
        if (share === 0) continue;
        draw -= share;
        if (draw <= 0) return place.height;
      }
      // Rounding left the draw just above zero: the last qualifying place, already in `top`.
      return lastQualifying(current, appeal);
    },
  };
}
