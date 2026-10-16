import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { Plant, Prop } from "./layout";
import { createPlaceFinder, placesOf, PROP_HEIGHT_SHARE } from "./places";

const plant = (x: number, z: number, tags: readonly string[]): Plant => ({
  kind: "anemone",
  color: "#ffffff",
  x,
  z,
  height: 0.2,
  rotation: 0,
  swayPhase: 0,
  seed: 0,
  tags,
});

const prop = (x: number, z: number, size: number): Prop => ({
  kind: "rock",
  color: "#888888",
  x,
  z,
  size,
  rotation: 0,
  seed: 0,
  tags: ["rock"],
});

describe("placesOf", () => {
  it("makes a place of every plant and prop that has tags", () => {
    const places = placesOf([plant(1, -1, ["anemone"]), plant(0, -1, [])], [prop(2, -2, 0.4)]);

    expect(places.map((place) => place.tags)).toEqual([["anemone"], ["rock"]]);
  });

  it("uses a plant's height and part of a prop's size as the height of the place", () => {
    const places = placesOf([plant(1, -1, ["anemone"])], [prop(2, -2, 0.4)]);

    expect(places.map((place) => place.height)).toEqual([0.2, 0.4 * PROP_HEIGHT_SHARE]);
  });
});

describe("createPlaceFinder", () => {
  const places = placesOf(
    [plant(-2, -1, ["anemone"]), plant(2, -1, ["anemone"]), plant(0, -1, ["plant"])],
    [],
  );
  const seabed = (x: number) => (x > 0 ? 0.5 : 0);

  it("finds the top of the nearest place with a tag", () => {
    const finder = createPlaceFinder(() => places, seabed);
    const top = new Vector3();

    const found = finder.nearest("anemone", new Vector3(1, 1, -1), top);

    expect(found).toBe(true);
    expect(top.toArray()).toEqual([2, 0.7, -1]);
  });

  it("finds nothing when no place has the tag", () => {
    const finder = createPlaceFinder(() => places, seabed);

    expect(finder.nearest("coral", new Vector3(), new Vector3())).toBe(false);
  });
});
