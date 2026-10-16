import type { Vector3 } from "three";
import type { Plant, Prop } from "./layout";
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

/** A prop's top stands at this share of its rough diameter above its base. */
export const PROP_HEIGHT_SHARE = 0.5;

/** The places of a laid-out scenery: every plant and prop with at least one tag. */
export function placesOf(plants: readonly Plant[], props: readonly Prop[]): Place[] {
  return [
    ...plants.map(({ x, z, height, tags }) => ({ x, z, height, tags })),
    ...props.map(({ x, z, size, tags }) => ({ x, z, height: size * PROP_HEIGHT_SHARE, tags })),
  ].filter((place) => place.tags.length > 0);
}

/** Looks up places by tag. */
export interface PlaceFinder {
  /**
   * Writes into `top` the top of the place tagged `tag` nearest to `from`
   * (seen from above) and returns true, or returns false when there is none.
   */
  nearest(tag: string, from: Vector3, top: Vector3): boolean;
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
  };
}
