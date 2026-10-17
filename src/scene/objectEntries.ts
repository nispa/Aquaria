import type { ObjectCatalog } from "./objectCatalog";
import { objectMaterialUrl, type ObjectManifest } from "./objectManifest";
import { MATERIALS_FOLDER } from "./materialManifest";
import type { FloraSpec, PropSpec, Scene, SurfaceMaterialSpec } from "./schema";

/**
 * Scene entries made from an object's own defaults (color, height, material,
 * depth bands): what the scene editor adds when the viewer places an object
 * the scene does not hold yet, and the palette's pictures.
 */

/** Height of a plant whose object sets none, m. */
const DEFAULT_PLANT_HEIGHT: readonly [number, number] = [0.2, 0.4];
const ALL_BANDS: readonly [number, number] = [0, 4];

/** The scene's surface material for an object's material, when it has one. */
function surfaceOf(id: string, manifest: ObjectManifest): SurfaceMaterialSpec | undefined {
  const url = objectMaterialUrl(id, manifest);
  const material = manifest.material;
  if (url === undefined || material === undefined) return undefined;
  const folder = url.slice(MATERIALS_FOLDER.length + 1).split("/")[0];
  if (folder === undefined || !url.startsWith(`${MATERIALS_FOLDER}/`)) return undefined;
  return { id: folder, tileSize: material.tileSize, displacement: material.displacement };
}

/** An empty flora entry for a plant, with its object's defaults. */
export function floraEntryFor(id: string, manifest: ObjectManifest): FloraSpec {
  const placement = manifest.traits.placement;
  return {
    kind: id,
    count: 0,
    bands: [...(placement?.bands ?? ALL_BANDS)],
    height: [...(placement?.height ?? DEFAULT_PLANT_HEIGHT)],
    color: manifest.color,
    ...(manifest.tipColor === undefined ? {} : { tipColor: manifest.tipColor }),
  };
}

/** An empty prop entry for an object, with its object's defaults. */
export function propEntryFor(id: string, manifest: ObjectManifest): PropSpec {
  const material = surfaceOf(id, manifest);
  return {
    kind: id,
    count: 0,
    color: manifest.color,
    ...(material === undefined ? {} : { material }),
  };
}

/**
 * The scene holding one of every plant and object of the catalog and
 * nothing else, each entry keyed by its object id: the palette's pictures
 * are drawn from it like the panel's scenery cards.
 */
export function paletteScene(scene: Scene, objects: ObjectCatalog): Scene {
  const one = <T extends { count: number }>(entry: T): T => ({ ...entry, count: 1 });
  const entries = <T>(
    category: ObjectManifest["category"],
    make: (id: string, manifest: ObjectManifest) => T,
  ): T[] =>
    objects.ids(category).flatMap((id) => {
      const manifest = objects.get(id);
      return manifest === undefined ? [] : [make(id, manifest)];
    });
  return {
    ...scene,
    flora: entries("plant", floraEntryFor).map(one),
    props: entries("object", propEntryFor).map(one),
  };
}
