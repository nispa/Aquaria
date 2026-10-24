import type { ObjectCatalog } from "./objectCatalog";
import { floraEntryFor, propEntryFor } from "./objectEntries";
import type { ObjectManifest } from "./objectManifest";
import { MAX_FLORA_PER_ENTRY, MAX_PROPS_PER_ENTRY, type Scene } from "./schema";

/**
 * Scenery entries (plants, rocks, corals, shells) as the control panel sees
 * them: one count per entry, addressed by a key that stays the same as long
 * as the scene file keeps its entries in order.
 */

export interface SceneryEntry {
  /** The kind, suffixed with -2, -3… when a kind appears more than once. */
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly max: number;
}

interface NamedEntry {
  readonly kind: string;
  readonly name?: string | undefined;
  readonly count: number;
}

function keyed(entries: readonly NamedEntry[]): string[] {
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    const occurrence = (seen.get(entry.kind) ?? 0) + 1;
    seen.set(entry.kind, occurrence);
    return occurrence === 1 ? entry.kind : `${entry.kind}-${occurrence}`;
  });
}

/** The largest count of an entry: one item per chosen spot, else the format's limit. */
function largestCount(
  entry: { readonly at?: readonly unknown[] | undefined },
  limit: number,
): number {
  return entry.at?.length ?? limit;
}

/**
 * Flora then props, in scene order, with their panel keys and labels (the
 * entry's name, or its object's).
 */
export function sceneryEntries(scene: Scene, objects: ObjectCatalog): readonly SceneryEntry[] {
  const all = [...scene.flora, ...scene.props];
  const keys = keyed(all);
  return all.map((entry, index) => ({
    key: keys[index] ?? entry.kind,
    label: entry.name ?? objects.get(entry.kind)?.name ?? entry.kind,
    count: entry.count,
    max: largestCount(
      entry,
      index < scene.flora.length ? MAX_FLORA_PER_ENTRY : MAX_PROPS_PER_ENTRY,
    ),
  }));
}

/** Returns a copy of the scene with the viewer's saved scenery counts. Unknown keys are ignored. */
export function applySceneryOverrides(
  scene: Scene,
  overrides: Readonly<Record<string, number>>,
): Scene {
  const keys = keyed([...scene.flora, ...scene.props]);
  const countFor = (index: number, count: number, max: number): number => {
    const key = keys[index];
    const override = key === undefined ? undefined : overrides[key];
    return override === undefined ? count : Math.min(override, max);
  };
  return {
    ...scene,
    flora: scene.flora.map((entry, index) => ({
      ...entry,
      count: countFor(index, entry.count, largestCount(entry, MAX_FLORA_PER_ENTRY)),
    })),
    props: scene.props.map((entry, index) => ({
      ...entry,
      count: countFor(
        scene.flora.length + index,
        entry.count,
        largestCount(entry, MAX_PROPS_PER_ENTRY),
      ),
    })),
  };
}

/**
 * A copy of the scene holding a single item of one scenery entry, even one
 * the viewer has emptied: what the panel's card for that entry shows.
 */
export function sceneryAlone(scene: Scene, key: string): Scene {
  const keys = keyed([...scene.flora, ...scene.props]);
  const index = keys.indexOf(key);
  const chosen = (offset: number) => (_entry: unknown, position: number) =>
    position + offset === index;
  return {
    ...scene,
    flora: scene.flora.filter(chosen(0)).map((entry) => ({ ...entry, count: 1 })),
    props: scene.props.filter(chosen(scene.flora.length)).map((entry) => ({ ...entry, count: 1 })),
  };
}

/** A plant or object of the catalog the viewer may add to a scene. */
export interface AddableScenery {
  readonly id: string;
  readonly name: string;
  readonly category: ObjectManifest["category"];
}

/** How many items an entry holds when the viewer adds it: a clump of plants, a few objects. */
export const ADDED_SCENERY_COUNT: Readonly<Record<ObjectManifest["category"], number>> = {
  plant: 8,
  object: 2,
};

/**
 * Height of the tanks the catalog's plant heights and object sizes are made
 * for (the big reef tanks), m. Added to a lower tank, they shrink with it.
 */
const CATALOG_TANK_HEIGHT = 3;

/** How much an added entry shrinks in this scene's tank: 1 in a big tank, never larger. */
function tankScale(scene: Scene): number {
  return Math.min(scene.tank.height / CATALOG_TANK_HEIGHT, 1);
}

const scaled = (range: readonly [number, number], scale: number): [number, number] => [
  range[0] * scale,
  range[1] * scale,
];

/** The scenery keys of a scene, flora then props. */
function sceneryKeys(scene: Scene): ReadonlySet<string> {
  return new Set(keyed([...scene.flora, ...scene.props]));
}

/**
 * The saved counts that name an object of the catalog rather than one of
 * the scene's entries: the plants and objects the viewer added, in the
 * order they were added.
 */
function addedCounts(
  scene: Scene,
  overrides: Readonly<Record<string, number>>,
  objects: ObjectCatalog,
): readonly (readonly [string, ObjectManifest, number])[] {
  const own = sceneryKeys(scene);
  return Object.entries(overrides).flatMap(([key, count]) => {
    const manifest = objects.get(key);
    return own.has(key) || manifest === undefined ? [] : [[key, manifest, count] as const];
  });
}

/**
 * Returns a copy of the scene holding the plants and objects the viewer
 * added from the catalog: a saved count under an object id the scene does
 * not use becomes an entry with that object's defaults, after the scene's
 * own, shrunk to fit a tank lower than the big ones. The scene's keys stay
 * as they were, since an added kind is new to it.
 */
export function withAddedScenery(
  scene: Scene,
  overrides: Readonly<Record<string, number>>,
  objects: ObjectCatalog,
): Scene {
  const added = addedCounts(scene, overrides, objects);
  if (added.length === 0) return scene;
  const scale = tankScale(scene);
  const flora = added.flatMap(([id, manifest, count]) => {
    if (manifest.category !== "plant") return [];
    const entry = floraEntryFor(id, manifest);
    return [
      {
        ...entry,
        count: Math.min(count, MAX_FLORA_PER_ENTRY),
        height: scaled(entry.height, scale),
      },
    ];
  });
  const props = added.flatMap(([id, manifest, count]) => {
    if (manifest.category !== "object") return [];
    const size = manifest.traits.placement?.size;
    return [
      {
        ...propEntryFor(id, manifest),
        count: Math.min(count, MAX_PROPS_PER_ENTRY),
        ...(size === undefined ? {} : { size: scaled(size, scale) }),
      },
    ];
  });
  return { ...scene, flora: [...scene.flora, ...flora], props: [...scene.props, ...props] };
}

/** The keys of the entries the viewer added to the scene (see `withAddedScenery`). */
export function addedSceneryKeys(
  scene: Scene,
  overrides: Readonly<Record<string, number>>,
  objects: ObjectCatalog,
): ReadonlySet<string> {
  return new Set(addedCounts(scene, overrides, objects).map(([key]) => key));
}

/** Every plant, then every object, of the catalog whose kind the scene does not hold yet. */
export function addableScenery(scene: Scene, objects: ObjectCatalog): readonly AddableScenery[] {
  const held = new Set([...scene.flora, ...scene.props].map((entry) => entry.kind));
  const offered = (category: ObjectManifest["category"]): AddableScenery[] =>
    objects.ids(category).flatMap((id) => {
      const manifest = objects.get(id);
      return manifest === undefined || held.has(id) ? [] : [{ id, name: manifest.name, category }];
    });
  return [...offered("plant"), ...offered("object")];
}
