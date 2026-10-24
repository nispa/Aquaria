import { MAX_SPOTS } from "./lights";
import type { Scene } from "./schema";
import {
  MAX_FLORA_PER_ENTRY,
  MAX_INDIVIDUALS_PER_SPECIES,
  MAX_PROPS_PER_ENTRY,
  MAX_ROCKWORK_ROCKS,
} from "./schema";
import { TANK_SIZE_MEASURES, TANK_SIZES, type TankMeasures, type TankSize } from "./tankMeasures";

export { TANK_SIZE_MEASURES, TANK_SIZES, type TankMeasures, type TankSize };

/** Fish keep their real size, so their number follows the volume to this power. */
const FISH_EXPONENT = 0.5;
/** Stones and woods grow with the tank's volume to this power: a little, not in step. */
const OBJECT_EXPONENT = 0.25;
/** Plants follow the tank's height to this power; a carpet must not become dust. */
const PLANT_HEIGHT_EXPONENT = 0.5;
/** The tallest plant, as a share of the tank's height: the top stays free. */
const MAX_PLANT_SHARE = 0.8;
/** A school asked for with at least this many fish... */
const SCHOOL_FROM = 8;
/** ...never shrinks below this many. */
const MIN_SCHOOL = 3;

const volumeOf = (tank: TankMeasures): number => tank.width * tank.height * tank.depth;

/** The size whose volume a tank is closest to. */
export function tankSizeOf(tank: TankMeasures): TankSize {
  const volume = Math.log(volumeOf(tank));
  const distance = (size: TankSize): number =>
    Math.abs(Math.log(volumeOf(TANK_SIZE_MEASURES[size])) - volume);
  return TANK_SIZES.reduce((best, size) => (distance(size) < distance(best) ? size : best));
}

/** The size a scene is written for: the one it declares, else the one its measures suggest. */
export function sceneSize(scene: Pick<Scene, "tank" | "size">): TankSize {
  return scene.size ?? tankSizeOf(scene.tank);
}

/** Whether a scene can be seen at another size: rockwork built of blocks has a fixed shape. */
export function canResize(scene: Scene): boolean {
  return scene.blocks === undefined;
}

type Pair = readonly [number, number];

const clampCount = (count: number, original: number, limit: number): number =>
  original <= 0 ? 0 : Math.min(Math.max(Math.round(count), 1), limit);

/**
 * The scene as it looks in a tank of another size. The tank takes the
 * measures of the size; fish keep their real size, so there are fewer of
 * them, in proportion to the square root of the volume (a school keeps at
 * least three); plants and objects keep their density, so their number
 * follows the floor area; plants follow the height, stones and woods the
 * volume, a little. Chosen spots move with the tank. Returns the scene
 * itself when it already has that size or cannot be resized.
 */
export function resizeScene(scene: Scene, size: TankSize): Scene {
  if (!canResize(scene) || size === sceneSize(scene)) return scene;
  const target = TANK_SIZE_MEASURES[size];
  const across = target.width / scene.tank.width;
  const along = target.depth / scene.tank.depth;
  const area = across * along;
  const volume = volumeOf(target) / volumeOf(scene.tank);
  const objectScale = volume ** OBJECT_EXPONENT;
  const plantScale = (target.height / scene.tank.height) ** PLANT_HEIGHT_EXPONENT;
  const highest = target.height * MAX_PLANT_SHARE;

  const plantHeight = (height: number): number => Math.min(height * plantScale, highest);
  const plantHeights = ([low, high]: Pair): [number, number] => {
    const top = plantHeight(high);
    return [Math.min(plantHeight(low), top), top];
  };
  const objectSize = (value: number): number => value * objectScale;
  const moved = <Spot extends { x: number; z: number }>(spot: Spot): Spot => ({
    ...spot,
    x: spot.x * across,
    z: spot.z * along,
  });

  const fauna = scene.fauna
    .map((entry) => {
      const scaled = Math.round(entry.count * volume ** FISH_EXPONENT);
      const school =
        entry.count >= SCHOOL_FROM && scaled > 0 ? Math.max(scaled, MIN_SCHOOL) : scaled;
      return { ...entry, count: Math.min(school, MAX_INDIVIDUALS_PER_SPECIES) };
    })
    .filter((entry) => entry.count > 0);
  const largest = scene.fauna.reduce<(typeof scene.fauna)[number] | undefined>(
    (best, entry) => (best === undefined || entry.count > best.count ? entry : best),
    undefined,
  );
  const kept = fauna.length > 0 || largest === undefined ? fauna : [{ ...largest, count: 1 }];

  return {
    ...scene,
    size,
    tank: { ...target },
    fauna: kept,
    flora: scene.flora.map((entry) => {
      const count = clampCount(entry.count * area, entry.count, MAX_FLORA_PER_ENTRY);
      return {
        ...entry,
        count,
        height: plantHeights(entry.height),
        ...(entry.at === undefined
          ? {}
          : {
              at: entry.at.slice(0, count).map((spot) => ({
                ...moved(spot),
                ...(spot.height === undefined ? {} : { height: plantHeight(spot.height) }),
              })),
            }),
      };
    }),
    props: scene.props.map((entry) => {
      const count = clampCount(entry.count * area, entry.count, MAX_PROPS_PER_ENTRY);
      return {
        ...entry,
        count,
        ...(entry.size === undefined
          ? {}
          : { size: [objectSize(entry.size[0]), objectSize(entry.size[1])] as [number, number] }),
        ...(entry.at === undefined
          ? {}
          : {
              at: entry.at.slice(0, count).map((spot) => ({
                ...moved(spot),
                ...(spot.size === undefined ? {} : { size: objectSize(spot.size) }),
              })),
            }),
      };
    }),
    ...(scene.rockwork === undefined
      ? {}
      : {
          rockwork: {
            ...scene.rockwork,
            height: plantHeights(scene.rockwork.height),
            thickness: scene.rockwork.thickness * along,
            rocks: clampCount(
              scene.rockwork.rocks * area,
              scene.rockwork.rocks,
              MAX_ROCKWORK_ROCKS,
            ),
          },
        }),
    lights: {
      ...scene.lights,
      fixture: {
        ...scene.lights.fixture,
        spots: Math.min(Math.max(Math.round(scene.lights.fixture.spots * across), 1), MAX_SPOTS),
      },
    },
  };
}
