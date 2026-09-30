import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseShaderPackIndex, resolveShaderPack } from "../../scene/shaderPack";
import { EFFECTS } from "./index";

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

describe("effect registry", () => {
  it("has unique effect ids", () => {
    const ids = EFFECTS.map((effect) => effect.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("validates every bundled shader pack", () => {
    const index = parseShaderPackIndex(readJson("../../../public/shaderpacks/index.json"));

    const packs = index.packs.map((id) =>
      resolveShaderPack(readJson(`../../../public/shaderpacks/${id}.json`), EFFECTS),
    );

    expect(packs.map((pack) => pack.id)).toEqual(index.packs);
  });
});
