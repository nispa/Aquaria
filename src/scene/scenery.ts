import {
  MAX_FLORA_PER_ENTRY,
  MAX_PROPS_PER_ENTRY,
  type FloraSpec,
  type PropSpec,
  type Scene,
} from "./schema";

/**
 * Scenery entries (plants, rocks, corals, shells) as the control panel sees
 * them: one count per entry, addressed by a key that stays the same as long
 * as the scene file keeps its entries in order.
 */

type SceneryKind = FloraSpec["kind"] | PropSpec["kind"];

const KIND_LABELS: Readonly<Record<SceneryKind, string>> = {
  kelp: "Kelp",
  seagrass: "Seagrass",
  anemone: "Anemones",
  rock: "Rocks",
  starfish: "Starfish",
  shell: "Shells",
  "brain-coral": "Brain corals",
  "branch-coral": "Branching corals",
  "fan-coral": "Sea fans",
};

export interface SceneryEntry {
  /** The kind, suffixed with -2, -3… when a kind appears more than once. */
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly max: number;
}

interface NamedEntry {
  readonly kind: SceneryKind;
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

/** Flora then props, in scene order, with their panel keys and labels. */
export function sceneryEntries(scene: Scene): readonly SceneryEntry[] {
  const all = [...scene.flora, ...scene.props];
  const keys = keyed(all);
  return all.map((entry, index) => ({
    key: keys[index] ?? entry.kind,
    label: entry.name ?? KIND_LABELS[entry.kind],
    count: entry.count,
    max: index < scene.flora.length ? MAX_FLORA_PER_ENTRY : MAX_PROPS_PER_ENTRY,
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
      count: countFor(index, entry.count, MAX_FLORA_PER_ENTRY),
    })),
    props: scene.props.map((entry, index) => ({
      ...entry,
      count: countFor(scene.flora.length + index, entry.count, MAX_PROPS_PER_ENTRY),
    })),
  };
}
