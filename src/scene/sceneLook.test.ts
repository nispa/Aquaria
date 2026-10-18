import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { EffectDescriptor, LookFeature } from "./look";
import { SceneValidationError } from "./parse";
import {
  DEFAULT_EXPOSURE,
  effectParams,
  lookParamIssues,
  parseSceneLook,
  withLookStartup,
} from "./sceneLook";

const BLOOM: EffectDescriptor = {
  id: "bloom",
  name: "Bloom",
  stage: "hdr",
  startup: "added",
  params: z.object({ strength: z.number().max(3).default(0.3) }),
};

describe("scene look", () => {
  it("fills in the defaults of an empty look", () => {
    const look = parseSceneLook({ name: "Plain" }, "plain");

    expect(look).toEqual({ name: "Plain", exposure: DEFAULT_EXPOSURE, features: {}, effects: {} });
  });

  it("rejects a sun that points nowhere, naming the look", () => {
    expect(() => parseSceneLook({ name: "Dark", sun: [0, 0, 0] }, "dark")).toThrow(
      /look "dark"[\s\S]*sun/,
    );
  });

  it("throws a validation error for a look without a name", () => {
    expect(() => parseSceneLook({}, "nameless")).toThrow(SceneValidationError);
  });

  it("gives an effect the parameters the look sets for it", () => {
    const look = parseSceneLook({ name: "Hero", effects: { bloom: { strength: 1 } } }, "hero");

    expect(effectParams(look, "bloom")).toEqual({ strength: 1 });
  });

  it("leaves an effect the look does not name to its defaults", () => {
    const look = parseSceneLook({ name: "Hero" }, "hero");

    expect(effectParams(look, "bloom")).toEqual({});
  });

  it("reports parameters an effect does not accept", () => {
    const look = parseSceneLook({ name: "Hero", effects: { bloom: { strength: 9 } } }, "hero");

    expect(lookParamIssues(look, [BLOOM]).invalid).toEqual([expect.stringMatching(/bloom/)]);
  });

  it("switches on at startup a feature the look asks for", () => {
    const features: LookFeature[] = [
      { id: "waves", name: "Waves", kind: "lighting", startup: "manual" },
    ];
    const look = parseSceneLook({ name: "Hero", features: { waves: true } }, "hero");

    expect(withLookStartup(features, look)[0]?.startup).toBe("base");
  });

  it("leaves to the viewer a feature the look switches off", () => {
    const features: LookFeature[] = [
      { id: "bloom", name: "Bloom", kind: "effect", startup: "added" },
    ];
    const look = parseSceneLook({ name: "Calm", features: { bloom: false } }, "calm");

    expect(withLookStartup(features, look)[0]?.startup).toBe("manual");
  });

  it("lists effects the look names but nobody provides", () => {
    const look = parseSceneLook({ name: "Hero", effects: { sparkle: {} } }, "hero");

    expect(lookParamIssues(look, [BLOOM]).unknown).toEqual(["sparkle"]);
  });
});
