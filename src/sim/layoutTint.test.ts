import { describe, expect, it } from "vitest";
import { parseObjectManifest } from "../scene/objectManifest";
import { propTraitsOf } from "./layout";

const scan = (traits: Record<string, unknown>) =>
  parseObjectManifest(
    {
      name: "Staghorn coral",
      category: "object",
      model: "model.glb",
      traits,
      credit: { author: "Smithsonian", source: "https://3d.si.edu", license: "CC0-1.0" },
    },
    "staghorn-coral",
  ).manifest;

describe("tinted models", () => {
  it("passes the tint of a model on to its props", () => {
    expect(propTraitsOf(scan({ tint: { strength: 0.8 } }), "staghorn-coral")?.tint).toBe(0.8);
  });

  it("leaves a model's own colors when it has no tint trait", () => {
    expect(propTraitsOf(scan({}), "staghorn-coral")?.tint).toBeUndefined();
  });
});
