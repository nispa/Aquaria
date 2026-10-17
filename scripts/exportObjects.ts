import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import type { ObjectManifest } from "../src/scene/objectManifest";
import type { BlocksSpec, Scene } from "../src/scene/schema";

/**
 * Bakes every object with a `recipe` in `public/assets/objects/` into
 * `public/assets/objects/<id>/model.glb` (a few seed variants side by side,
 * with standard PBR material, `_SWAY` vertex weights on plants, and `traits`
 * in glTF `extras`), and bakes block rock (`blocks`) from every bundled scene
 * that has one into `public/scenes/<id>-blocks.glb`.
 *
 * Run with `pnpm export:objects`.
 */
async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, "..");
  const server = await createServer({ root, logLevel: "error" });
  try {
    const { parseObjectIndex } = (await server.ssrLoadModule("/src/scene/objectCatalog.ts")) as {
      parseObjectIndex: (input: unknown) => string[];
    };
    const { OBJECT_MANIFEST_FILE, OBJECTS_FOLDER, parseObjectManifest } =
      (await server.ssrLoadModule("/src/scene/objectManifest.ts")) as {
        OBJECT_MANIFEST_FILE: string;
        OBJECTS_FOLDER: string;
        parseObjectManifest: (input: unknown, id: string) => { manifest: ObjectManifest };
      };
    const { bakeBlockworkGlb, bakeObjectGlb } = (await server.ssrLoadModule(
      "/src/render/objectBake.ts",
    )) as {
      bakeObjectGlb: (id: string, manifest: ObjectManifest, variantCount?: number) => Uint8Array;
      bakeBlockworkGlb: (
        tank: { readonly width: number; readonly height: number; readonly depth: number },
        blocks: BlocksSpec,
        seed?: number,
      ) => Uint8Array;
    };

    const objectsRoot = resolve(root, "public", OBJECTS_FOLDER);
    const ids = parseObjectIndex(
      JSON.parse(readFileSync(resolve(objectsRoot, "index.json"), "utf8")),
    );

    let exportedObjects = 0;
    for (const id of ids) {
      const folder = resolve(objectsRoot, id);
      const raw: unknown = JSON.parse(readFileSync(resolve(folder, OBJECT_MANIFEST_FILE), "utf8"));
      const { manifest } = parseObjectManifest(raw, id);
      if (manifest.recipe === undefined) continue;
      const glb = bakeObjectGlb(id, manifest);
      writeFileSync(resolve(folder, "model.glb"), glb);
      exportedObjects += 1;
    }

    const scenesRoot = resolve(root, "public/scenes");
    const sceneIndex = JSON.parse(readFileSync(resolve(scenesRoot, "index.json"), "utf8")) as {
      groups: { scenes: string[] }[];
    };
    const sceneFiles = [
      ...sceneIndex.groups.flatMap((group) =>
        group.scenes.map((sceneId) => resolve(scenesRoot, `${sceneId}.json`)),
      ),
      ...process.argv.slice(2).map((arg) => resolve(process.cwd(), arg)),
    ];
    let exportedRocks = 0;
    for (const sceneFile of sceneFiles) {
      const raw = JSON.parse(readFileSync(sceneFile, "utf8")) as Partial<Scene>;
      if (raw.blocks === undefined || raw.tank === undefined) continue;
      const glb = bakeBlockworkGlb(raw.tank, raw.blocks, raw.seed ?? 0);
      const outPath = sceneFile.replace(/\.json$/i, "-blocks.glb");
      writeFileSync(outPath, glb);
      exportedRocks += 1;
    }

    process.stdout.write(
      `Exported ${String(exportedObjects)} object model(s) and ${String(exportedRocks)} block rock model(s).\n`,
    );
  } finally {
    await server.close();
  }
}

void main();
