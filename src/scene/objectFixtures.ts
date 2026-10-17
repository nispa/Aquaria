import { readFileSync } from "node:fs";
import { createObjectCatalog, parseObjectIndex, type ObjectCatalog } from "./objectCatalog";
import { OBJECT_MANIFEST_FILE, parseObjectManifest } from "./objectManifest";

/**
 * The bundled objects of `public/assets/objects/`, read from disk: tests use
 * the real data, so a change to an object.json is a change the tests see.
 * Node only; never imported by the app.
 */
export function bundledObjects(): ObjectCatalog {
  const folder = new URL("../../public/assets/objects/", import.meta.url);
  const read = (path: string): unknown => JSON.parse(readFileSync(new URL(path, folder), "utf8"));
  const ids = parseObjectIndex(read("index.json"));
  return createObjectCatalog(
    ids.map((id) => [id, parseObjectManifest(read(`${id}/${OBJECT_MANIFEST_FILE}`), id).manifest]),
  );
}
