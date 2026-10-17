import { Box3, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createRng } from "../core/rng";
import type { Plant, Prop } from "./layout";
import { propTop } from "./obstacles";
import { createPlaceFinder, placesOf } from "./places";
import { floorHeight } from "./terrain";

const plant = (x: number, z: number, tags: readonly string[]): Plant => ({
  kind: "anemone",
  generator: "anemone",
  sway: 0.05,
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
  generator: "rock",
  shape: { across: 0.58, up: 0.36, along: 0.58, sink: 0, lift: 0 },
  solid: true,
  color: "#888888",
  x,
  z,
  size,
  rotation: 0,
  seed: 0,
  tags: ["rock"],
});

describe("placesOf", () => {
  it("stands a place where its plant or prop is drawn, sunk into the rockwork or not", () => {
    const sunk = { ...prop(2, -2, 0.4), elevation: 0.3 };

    const [place] = placesOf([], [sunk]);

    expect(place?.base).toBeCloseTo(floorHeight(2, -2) + 0.3);
  });

  it("makes a place of every plant and prop that has tags", () => {
    const places = placesOf([plant(1, -1, ["anemone"]), plant(0, -1, [])], [prop(2, -2, 0.4)]);

    expect(places.map((place) => place.tags)).toEqual([["anemone"], ["rock"]]);
  });

  it("uses a plant's height and the top of a prop's shape as the height of the place", () => {
    const places = placesOf([plant(1, -1, ["anemone"])], [prop(2, -2, 0.4)]);

    expect(places.map((place) => place.height)).toEqual([0.2, propTop(prop(2, -2, 0.4))]);
  });
});

describe("createPlaceFinder", () => {
  const anemone = (x: number) => ({ x, z: -1, height: 0.2, tags: ["anemone"] });
  const places = [anemone(-2), anemone(2), { x: 0, z: -1, height: 0.2, tags: ["plant"] }];
  const seabed = (x: number) => (x > 0 ? 0.5 : 0);

  it("finds the top of the nearest place with a tag", () => {
    const finder = createPlaceFinder(() => places, seabed);
    const top = new Vector3();

    const found = finder.nearest("anemone", new Vector3(1, 1, -1), top);

    expect(found).toBe(true);
    expect(top.toArray()).toEqual([2, 0.7, -1]);
  });

  it("stands a place on its own base rather than the seabed, when it has one", () => {
    const finder = createPlaceFinder(() => [{ ...anemone(2), base: 0.3 }], seabed);
    const top = new Vector3();

    finder.nearest("anemone", new Vector3(1, 1, -1), top);

    expect(top.y).toBeCloseTo(0.5);
  });

  it("finds nothing when no place has the tag", () => {
    const finder = createPlaceFinder(() => places, seabed);

    expect(finder.nearest("coral", new Vector3(), new Vector3())).toBe(false);
  });
});

describe("choosing an interesting place", () => {
  const algae = { x: 1, z: -1, height: 0.3, tags: ["rock", "algae"] };
  const coral = { x: -1, z: -1, height: 0.4, tags: ["coral"] };
  const far = { x: 6, z: -1, height: 0.3, tags: ["algae"] };
  const flat = () => 0;
  const everywhere = new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10));

  const draws = (
    interests: Readonly<Record<string, number>>,
    within = everywhere,
    seed = 1,
  ): string[] => {
    const finder = createPlaceFinder(() => [algae, coral, far], flat);
    const rng = createRng(seed);
    const top = new Vector3();
    return Array.from({ length: 200 }, () =>
      finder.pick(interests, new Vector3(0, 1, -1), 3, within, rng, top) < 0 ? "none" : `${top.x}`,
    );
  };

  it("only picks places with a tag the fish cares about", () => {
    expect(new Set(draws({ coral: 1 }))).toEqual(new Set(["-1"]));
  });

  it("prefers the tags that interest it most", () => {
    const picks = draws({ coral: 1, algae: 0.2 });

    const corals = picks.filter((pick) => pick === "-1").length;
    expect(corals).toBeGreaterThan(picks.length * 0.6);
    expect(corals).toBeLessThan(picks.length);
  });

  it("ignores places beyond its reach", () => {
    expect(draws({ algae: 1 })).not.toContain("6");
  });

  it("ignores places outside the region it may go to", () => {
    const left = new Box3(new Vector3(-3, -1, -3), new Vector3(0, 2, 0));

    expect(new Set(draws({ algae: 1, coral: 1 }, left))).toEqual(new Set(["-1"]));
  });

  it("finds nothing when no place interests it", () => {
    expect(new Set(draws({ starfish: 1 }))).toEqual(new Set(["none"]));
  });

  it("tells the size of the place it picked", () => {
    const finder = createPlaceFinder(() => [coral], flat);

    const size = finder.pick(
      { coral: 1 },
      new Vector3(),
      3,
      everywhere,
      createRng(1),
      new Vector3(),
    );

    expect(size).toBe(0.4);
  });
});
