import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { EffectDescriptor, LookFeature } from "./look";
import { SceneValidationError } from "./parse";
import {
  chooseLook,
  DEFAULT_EXPOSURE,
  effectParams,
  lookParamIssues,
  mergeTweaks,
  parseSceneLook,
  PLAIN_LOOK,
  PLAIN_LOOK_ID,
  sunAngles,
  sunFromAngles,
  switchLookFeatures,
  tweakLook,
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

describe("choosing and tweaking a look", () => {
  const hero = parseSceneLook(
    { name: "Hero", exposure: 0.7, effects: { bloom: { strength: 1, radius: 0.4 } } },
    "hero",
  );
  const looks = new Map([["hero", hero]]);

  it("uses the scene's own look when the viewer chose none", () => {
    expect(chooseLook("hero", undefined, looks)).toEqual({ id: "hero", look: hero });
  });

  it("uses the plain look for a scene without one", () => {
    expect(chooseLook(undefined, undefined, looks)).toEqual({
      id: PLAIN_LOOK_ID,
      look: PLAIN_LOOK,
    });
  });

  it("uses the look the viewer chose over the scene's", () => {
    expect(chooseLook(undefined, "hero", looks).look).toBe(hero);
  });

  it("falls back to the scene's look when the chosen one is missing", () => {
    expect(chooseLook("hero", "sunset", looks).id).toBe("hero");
  });

  it("lets the viewer's tweaks replace single effect parameters", () => {
    const tweaked = tweakLook(hero, { effects: { bloom: { strength: 2 } } });

    expect(tweaked.effects.bloom).toEqual({ strength: 2, radius: 0.4 });
  });

  it("lets the viewer's tweaks replace the exposure and the sun", () => {
    const tweaked = tweakLook(hero, { exposure: 1.2, sun: [0, 1, 0] });

    expect([tweaked.exposure, tweaked.sun]).toEqual([1.2, [0, 1, 0]]);
  });

  it("keeps the look as it is without tweaks", () => {
    expect(tweakLook(hero, undefined)).toBe(hero);
  });
});

describe("sun angles", () => {
  it("puts a sun of height 90 degrees straight overhead", () => {
    expect(sunFromAngles(90, 0)).toEqual([expect.closeTo(0), expect.closeTo(1), expect.closeTo(0)]);
  });

  it("puts a sun of turn 0 behind the tank", () => {
    const [, , z] = sunFromAngles(30, 0);

    expect(z).toBeLessThan(0);
  });

  it("reads back the angles a direction was made from", () => {
    const angles = sunAngles(sunFromAngles(35, 40));

    expect([Math.round(angles.height), Math.round(angles.turn)]).toEqual([35, 40]);
  });
});

describe("merging tweaks", () => {
  it("keeps earlier tweaks and lays the new ones over them", () => {
    const merged = mergeTweaks(
      { exposure: 0.8, effects: { bloom: { strength: 1 }, finish: { contrast: 1.2 } } },
      { effects: { bloom: { radius: 0.3 } } },
    );

    expect(merged).toEqual({
      exposure: 0.8,
      effects: { bloom: { strength: 1, radius: 0.3 }, finish: { contrast: 1.2 } },
    });
  });
});

describe("switching looks", () => {
  const hero = parseSceneLook({ name: "Hero", features: { waves: true, frame: true } }, "hero");
  const plain = parseSceneLook({ name: "Plain" }, "plain");

  it("switches on what the new look starts with", () => {
    const look = switchLookFeatures(new Set(["caustics"]), plain, hero, {});

    expect([...look].sort()).toEqual(["caustics", "frame", "waves"]);
  });

  it("switches off what only the old look had switched on", () => {
    const look = switchLookFeatures(new Set(["caustics", "waves", "frame"]), hero, plain, {});

    expect([...look]).toEqual(["caustics"]);
  });

  it("leaves alone a feature the viewer switched themselves", () => {
    const look = switchLookFeatures(new Set(["caustics", "waves"]), hero, plain, { waves: true });

    expect(look.has("waves")).toBe(true);
  });
});
