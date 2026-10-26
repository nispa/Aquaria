import { z } from "zod";
import type { ObjectCatalog } from "./objectCatalog";
import { formatIssues, SceneValidationError } from "./parse";
import type { Scene } from "./schema";

/**
 * Plants and objects Aquaria no longer draws, and what takes their place,
 * from the `retired` table of `public/assets/objects/index.json`: the
 * cartoon plants and corals of the first scenes, and the coral scans that
 * looked dead. A scene that still names one, bundled, saved in the browser
 * or imported, is brought up to date as it loads: the entry takes its
 * successor (an object, a plant, or an animal that moves), or is dropped
 * when there is none.
 */

const objectId = z.string().regex(/^[a-z0-9-]+$/);

/** A successor: another object or plant, an animal, or none (null). */
const successor = z.union([objectId, z.null(), z.object({ species: z.string().min(1) })]);

const retiredIndexSchema = z.object({
  retired: z.record(objectId, successor).default({}),
});

export type RetiredObjects = Readonly<Record<string, z.output<typeof successor>>>;

/** The `retired` table of the object index; none when it has none. */
export function parseRetiredObjects(input: unknown): RetiredObjects {
  const result = retiredIndexSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues("object index", result.error));
  }
  return result.data.retired;
}

type Flora = Scene["flora"][number];
type Prop = Scene["props"][number];

/** Every band, for an object that moves to the plants without bands of its own. */
const ALL_BANDS: Flora["bands"] = [0, 4];
/** A plant's height when the object it replaces gave no size, m. */
const DEFAULT_HEIGHT: Flora["height"] = [0.1, 0.2];

/** An object's entry as a plant's: its sizes become heights, its chosen spots keep their places. */
function propAsPlant(entry: Prop, kind: string): Flora {
  return {
    kind,
    ...(entry.name === undefined ? {} : { name: entry.name }),
    count: entry.count,
    bands: entry.bands ?? ALL_BANDS,
    height: entry.size ?? DEFAULT_HEIGHT,
    color: entry.color,
    ...(entry.on === undefined ? {} : { on: entry.on }),
    ...(entry.tags === undefined ? {} : { tags: entry.tags }),
    ...(entry.at === undefined
      ? {}
      : {
          at: entry.at.map(({ size, ...spot }) =>
            size === undefined ? spot : { ...spot, height: size },
          ),
        }),
  };
}

/**
 * The scene with its retired plants and objects replaced (see above);
 * `species` are the ids the catalog has, for the ones that become animals.
 * Returns the scene itself when it names none.
 */
export function retireObjects(
  scene: Scene,
  retired: RetiredObjects,
  objects: ObjectCatalog,
  species: readonly string[],
): Scene {
  const isRetired = (kind: string): boolean => Object.hasOwn(retired, kind);
  if (
    !scene.flora.some((entry) => isRetired(entry.kind)) &&
    !scene.props.some((entry) => isRetired(entry.kind))
  ) {
    return scene;
  }
  const flora: Flora[] = [];
  const props: Prop[] = [];
  const fauna = [...scene.fauna];

  for (const entry of scene.flora) {
    if (!isRetired(entry.kind)) {
      flora.push(entry);
      continue;
    }
    const next = retired[entry.kind];
    if (typeof next === "string" && objects.get(next)?.category === "plant") {
      flora.push({ ...entry, kind: next });
    }
  }

  for (const entry of scene.props) {
    if (!isRetired(entry.kind)) {
      props.push(entry);
      continue;
    }
    const next = retired[entry.kind];
    if (typeof next === "string") {
      const category = objects.get(next)?.category;
      if (category === "object") props.push({ ...entry, kind: next });
      if (category === "plant") flora.push(propAsPlant(entry, next));
    } else if (next !== null && next !== undefined && species.includes(next.species)) {
      fauna.push({ species: next.species, count: entry.count });
    }
  }

  return { ...scene, flora, props, fauna };
}
