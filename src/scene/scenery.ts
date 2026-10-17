import type { ObjectCatalog } from "./objectCatalog";
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
