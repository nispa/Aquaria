import type { Rng } from "../core/rng";
import type { ObjectCatalog } from "../scene/objectCatalog";
import type { ObjectManifest } from "../scene/objectManifest";
import {
  PLANT_GENERATORS,
  PROP_GENERATORS,
  type FloraSpec,
  type PlantGenerator,
  type PropGenerator,
  type PropSpec,
  type SurfaceMaterialSpec,
} from "../scene/schema";
import { tagsOf } from "../scene/tags";
import { TRAITS } from "../scene/traits";
import type { PropShape } from "./obstacles";
import { bandDepthRange, type TankSize } from "./tank";

/**
 * Static placement of plants and props. Pure and seeded, so a scene always
 * looks the same and the layout can be tested without a renderer. The one
 * place that reads the objects' traits (scene/traits): each item carries
 * what the rest of the engine needs, so nothing else looks objects up.
 */

export interface Plant {
  /** The object it is (its folder in public/assets/objects). */
  readonly kind: string;
  /** How it is drawn: one of Aquaria's plant generators. */
  readonly generator: PlantGenerator;
  /** How far its tips sway, m (the `sway` trait); 0 when it does not. */
  readonly sway: number;
  /** One color; a palette entry has already been resolved to one of its colors. */
  readonly color: string;
  readonly x: number;
  readonly z: number;
  readonly height: number;
  /** Rotation around the vertical axis, radians. */
  readonly rotation: number;
  /** Offset so neighbouring plants do not sway in lockstep, radians. */
  readonly swayPhase: number;
  /** Seeds the renderer's per-plant details (blade jitter), independent of other plants. */
  readonly seed: number;
  /** Height of the base above the sand, m, when growing on rockwork. */
  readonly elevation?: number;
  /** Color the leaves turn towards the top, when the entry sets one. */
  readonly tipColor?: string;
  /** What the plant is to fish; see scene/tags. */
  readonly tags: readonly string[];
}

export interface Prop {
  /** The object it is (its folder in public/assets/objects). */
  readonly kind: string;
  /** How it is drawn: one of Aquaria's object generators. */
  readonly generator: PropGenerator;
  /** Its rough shape (the `collision` trait), relative to its size. */
  readonly shape: PropShape;
  /** Whether fish swim round it. */
  readonly solid: boolean;
  readonly color: string;
  readonly x: number;
  readonly z: number;
  /** Rough diameter in meters. */
  readonly size: number;
  readonly rotation: number;
  /** Seeds the renderer's per-prop details (shape variant), independent of other props. */
  readonly seed: number;
  /** Photographic surface, when the scene entry sets one. */
  readonly material?: SurfaceMaterialSpec;
  /** Height of the base above the sand, m, when set on rockwork. */
  readonly elevation?: number;
  /** What the item is to fish; see scene/tags. */
  readonly tags: readonly string[];
}

/** Keeps objects a little away from the glass and the side walls. */
const EDGE_CLEARANCE = 0.2;
const SEED_RANGE = 2 ** 32;

/** Size range of an object whose placement trait sets none, m. */
const DEFAULT_SIZE: readonly [number, number] = [0.2, 0.5];
/** An object without a collision trait: fish swim through it. */
const NO_COLLISION = { ...TRAITS.collision.schema.parse({}), solid: false };

const isPlantGenerator = (id: string): id is PlantGenerator =>
  (PLANT_GENERATORS as readonly string[]).includes(id);
const isPropGenerator = (id: string): id is PropGenerator =>
  (PROP_GENERATORS as readonly string[]).includes(id);

interface PlantTraits {
  readonly object: ObjectManifest;
  readonly generator: PlantGenerator;
  readonly sway: number;
}

/** What the layout needs of a plant object; undefined when Aquaria cannot draw it yet. */
function plantOf(object: ObjectManifest | undefined): PlantTraits | undefined {
  const generator = object?.recipe?.generator;
  if (object === undefined || generator === undefined || !isPlantGenerator(generator)) {
    return undefined;
  }
  return { object, generator, sway: object.traits.sway?.amount ?? 0 };
}

export interface PropTraits {
  readonly generator: PropGenerator;
  readonly shape: PropShape;
  readonly solid: boolean;
  readonly tags: readonly string[];
}

/** What a prop of this object is to the rest of the engine; undefined when it cannot be drawn yet. */
export function propTraitsOf(object: ObjectManifest | undefined): PropTraits | undefined {
  const generator = object?.recipe?.generator;
  if (object === undefined || generator === undefined || !isPropGenerator(generator)) {
    return undefined;
  }
  const { solid, ...shape } = object.traits.collision ?? NO_COLLISION;
  return { generator, shape, solid, tags: object.traits.tags ?? [] };
}

/**
 * One independent generator per entry, forked before anything is drawn, so
 * changing the count of one entry never moves the items of another. Within an
 * entry items are drawn in order, so growing a count keeps existing items.
 */
function entryGenerators(rng: Rng, count: number): Rng[] {
  return Array.from({ length: count }, () => rng.fork());
}

/** Half the width the camera sees at a depth z, m. */
export type HalfWidthAt = (z: number) => number;

/** Without a camera, scenery stays inside the tank walls. */
function tankHalfWidth(tank: TankSize): HalfWidthAt {
  return () => tank.width / 2;
}

/**
 * Seen in perspective, the view widens with depth: scenery spreads across the
 * visible width at its own depth, so the sides of the back are not left empty.
 * Items keep their depth and relative position (-1..1) when the view changes.
 */
function spreadX(across: number, z: number, halfWidthAt: HalfWidthAt): number {
  return across * Math.max(halfWidthAt(z) - EDGE_CLEARANCE, 0);
}

/** Where one item goes: x, z and its height above the sand when on rockwork. */
interface Spot {
  readonly x: number;
  readonly z: number;
  readonly elevation?: number;
}

/**
 * Rock that plants and objects may stand on: the procedural ridge
 * (sim/rockwork) or the tops of blocks (sim/blockwork).
 */
export interface RockSurface {
  /** A random spot on the rock, or undefined when there is no rock. */
  randomPoint(rng: Rng): readonly [number, number] | undefined;
  /** Height of the rock surface above the sand at (x, z), m. */
  heightAt(x: number, z: number): number;
}

/** Draws a spot on the sand within the depth range, or on the rock surface. */
function drawSpot(
  entryRng: Rng,
  depth: { readonly near: number; readonly far: number },
  halfWidthAt: HalfWidthAt,
  rock: RockSurface | undefined,
): Spot {
  const point = rock?.randomPoint(entryRng);
  if (rock !== undefined && point !== undefined) {
    const [x, z] = point;
    return { x, z, elevation: rock.heightAt(x, z) };
  }
  const across = entryRng.range(-1, 1);
  const z = entryRng.range(depth.far, Math.min(depth.near, -EDGE_CLEARANCE));
  return { x: spreadX(across, z, halfWidthAt), z };
}

/** A chosen spot (see the scene's `at`), as a spot to place an item on. */
interface ChosenSpot {
  readonly x: number;
  readonly z: number;
  readonly y?: number | undefined;
  readonly rotation?: number | undefined;
}

/**
 * Where an item at a chosen spot stands: at the spot's own height when it
 * sets one, else on the rock under it, else on the sand.
 */
function spotAt(chosen: ChosenSpot, rock: RockSurface | undefined): Spot {
  const elevation = chosen.y ?? rock?.heightAt(chosen.x, chosen.z) ?? 0;
  return elevation > 0 ? { x: chosen.x, z: chosen.z, elevation } : { x: chosen.x, z: chosen.z };
}

const DEGREES = Math.PI / 180;

/** A chosen spot's turn in radians, or a random one. */
function drawRotation(chosen: ChosenSpot | undefined, entryRng: Rng): number {
  return chosen?.rotation === undefined
    ? entryRng.range(0, Math.PI * 2)
    : chosen.rotation * DEGREES;
}

/** A single color is used as is; a palette gives each item one of its colors. */
function drawColor(color: string | readonly string[], entryRng: Rng): string {
  return typeof color === "string" ? color : entryRng.pick(color);
}

/**
 * Plants for the scene's flora entries. An entry whose object Aquaria cannot
 * draw (missing, or a model without a recipe) places nothing; the app warns
 * about it when the scene loads.
 */
export function layoutFlora(
  objects: ObjectCatalog,
  tank: TankSize,
  specs: readonly FloraSpec[],
  rng: Rng,
  halfWidthAt: HalfWidthAt = tankHalfWidth(tank),
  rockwork?: RockSurface,
): Plant[] {
  const generators = entryGenerators(rng, specs.length);
  return specs.flatMap((spec, index) => {
    const entryRng = generators[index] ?? rng;
    const plant = plantOf(objects.get(spec.kind));
    if (plant === undefined) return [];
    const depth = bandDepthRange(tank, spec.bands);
    const surface = spec.on === "rockwork" ? rockwork : undefined;
    const chosenSpots = spec.at?.slice(0, spec.count);
    return Array.from({ length: chosenSpots?.length ?? spec.count }, (_, item): Plant => {
      const chosen = chosenSpots?.[item];
      const spot =
        chosen === undefined
          ? drawSpot(entryRng, depth, halfWidthAt, surface)
          : spotAt(chosen, rockwork);
      return {
        kind: spec.kind,
        generator: plant.generator,
        sway: plant.sway,
        color: drawColor(spec.color, entryRng),
        ...spot,
        height: chosen?.height ?? entryRng.range(spec.height[0], spec.height[1]),
        rotation: drawRotation(chosen, entryRng),
        swayPhase: entryRng.range(0, Math.PI * 2),
        seed: Math.floor(entryRng.next() * SEED_RANGE),
        ...(spec.tipColor === undefined ? {} : { tipColor: spec.tipColor }),
        tags: tagsOf(spec, plant.object),
      };
    });
  });
}

/** Props for the scene's prop entries; see layoutFlora. */
export function layoutProps(
  objects: ObjectCatalog,
  tank: TankSize,
  specs: readonly PropSpec[],
  rng: Rng,
  halfWidthAt: HalfWidthAt = tankHalfWidth(tank),
  rockwork?: RockSurface,
): Prop[] {
  const generators = entryGenerators(rng, specs.length);
  return specs.flatMap((spec, index) => {
    const entryRng = generators[index] ?? rng;
    const object = objects.get(spec.kind);
    const traits = propTraitsOf(object);
    if (traits === undefined) return [];
    const placement = TRAITS.placement.schema.parse(object?.traits.placement ?? {});
    const depth = bandDepthRange(tank, spec.bands ?? placement.bands);
    const surface = spec.on === "rockwork" ? rockwork : undefined;
    const chosenSpots = spec.at?.slice(0, spec.count);
    return Array.from({ length: chosenSpots?.length ?? spec.count }, (_, item): Prop => {
      const chosen = chosenSpots?.[item];
      const spot =
        chosen === undefined
          ? drawSpot(entryRng, depth, halfWidthAt, surface)
          : spotAt(chosen, rockwork);
      return {
        kind: spec.kind,
        generator: traits.generator,
        shape: traits.shape,
        solid: traits.solid,
        color: drawColor(spec.color, entryRng),
        ...spot,
        size: chosen?.size ?? entryRng.range(...(spec.size ?? placement.size ?? DEFAULT_SIZE)),
        rotation: drawRotation(chosen, entryRng),
        seed: Math.floor(entryRng.next() * SEED_RANGE),
        ...(spec.material === undefined ? {} : { material: spec.material }),
        tags: tagsOf(spec, object),
      };
    });
  });
}
