import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCatalog, parseScene } from "./parse";

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

describe("bundled data files", () => {
  it("ships a valid species catalog", () => {
    expect(() => parseCatalog(readJson("../../public/species.json"))).not.toThrow();
  });

  it("ships a valid reef scene", () => {
    const catalog = parseCatalog(readJson("../../public/species.json"));

    expect(() => parseScene(readJson("../../public/scenes/reef.json"), catalog)).not.toThrow();
  });
});
