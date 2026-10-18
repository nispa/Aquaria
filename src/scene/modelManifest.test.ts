import { describe, expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import {
  ANIMAL_MODELS_FOLDER,
  modelFileUrl,
  modelIdsOf,
  parseModelManifest,
} from "./modelManifest";
import { parseCatalog, SceneValidationError } from "./parse";

const credit = {
  author: "Microsoft",
  source: "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BarramundiFish",
  license: "CC0-1.0",
};

describe("parseModelManifest", () => {
  it("fills in the defaults of a minimal manifest", () => {
    const manifest = parseModelManifest({ name: "Barramundi", credit }, "barramundi");

    expect(manifest).toMatchObject({
      file: "model.glb",
      forward: "+x",
      up: "+y",
      swimAmplitude: 0.07,
    });
  });

  it("accepts permissive code licenses such as MIT", () => {
    const manifest = parseModelManifest(
      { name: "Tetra", credit: { ...credit, license: "MIT" } },
      "tetra",
    );

    expect(manifest.credit.license).toBe("MIT");
  });

  it("rejects non-commercial licenses", () => {
    expect(() =>
      parseModelManifest(
        { name: "Betta", credit: { ...credit, license: "CC-BY-NC-4.0" } },
        "betta",
      ),
    ).toThrow(SceneValidationError);
  });

  it("rejects an up axis parallel to the forward axis", () => {
    expect(() =>
      parseModelManifest({ name: "Tuna", credit, forward: "+z", up: "-z" }, "tuna"),
    ).toThrow(/up must be perpendicular to forward/);
  });

  it("rejects files outside the model folder", () => {
    expect(() =>
      parseModelManifest({ name: "Tuna", credit, file: "../other/model.glb" }, "tuna"),
    ).toThrow(SceneValidationError);
  });

  it("has no moving eyes unless it names their bones", () => {
    const manifest = parseModelManifest({ name: "Barramundi", credit }, "barramundi");

    expect(manifest.eyes).toBeUndefined();
  });

  it("turns the eyes up to 20 degrees unless told otherwise", () => {
    const input = { name: "Barramundi", credit, eyes: { bones: ["Eye.L", "Eye.R"] } };

    expect(parseModelManifest(input, "barramundi").eyes).toEqual({
      bones: ["Eye.L", "Eye.R"],
      turn: 20,
    });
  });

  it("refuses eyes that turn further than an eye can", () => {
    const input = { name: "Barramundi", credit, eyes: { bones: ["Eye.L"], turn: 90 } };

    expect(() => parseModelManifest(input, "barramundi")).toThrow(/eyes\.turn/);
  });

  it("refuses eyes without bones", () => {
    const input = { name: "Barramundi", credit, eyes: { bones: [] } };

    expect(() => parseModelManifest(input, "barramundi")).toThrow(/eyes\.bones/);
  });

  it("paints eyes over a model's own, where the manifest puts them", () => {
    const input = {
      name: "Barramundi",
      credit,
      eyes: { painted: { center: [0.37, 0.14], radius: 0.024, iris: "#d8dde0" } },
    };

    expect(parseModelManifest(input, "barramundi").eyes?.painted).toEqual({
      center: [0.37, 0.14],
      radius: 0.024,
      pupil: 0.65,
      iris: "#d8dde0",
    });
  });

  it("refuses eyes that are both bones and painted", () => {
    const input = {
      name: "Barramundi",
      credit,
      eyes: { bones: ["Eye.L"], painted: { center: [0.3, 0], radius: 0.02, iris: "#ffffff" } },
    };

    expect(() => parseModelManifest(input, "barramundi")).toThrow(/eyes/);
  });

  it("drops a jaw below the mouth line, when the model has no mouth shape key", () => {
    const input = { name: "Barramundi", credit, mouth: { jaw: { start: 0.43, line: -0.01 } } };

    expect(parseModelManifest(input, "barramundi").mouth?.jaw).toEqual({
      start: 0.43,
      line: -0.01,
      drop: 0.02,
    });
  });

  it("names the pose an animal hides in", () => {
    const input = { name: "Hermit crab", credit, animations: { walk: "Walk", hide: "Hide" } };

    expect(parseModelManifest(input, "hermit-crab").animations?.hide).toBe("Hide");
  });

  it("refuses a mouth that is neither a shape key nor a jaw", () => {
    const input = { name: "Barramundi", credit, mouth: {} };

    expect(() => parseModelManifest(input, "barramundi")).toThrow(/mouth/);
  });

  it("lets the gill covers breathe, gently unless told otherwise", () => {
    const input = { name: "Barramundi", credit, gills: { edge: 0.28, top: 0.17, bottom: -0.06 } };

    expect(parseModelManifest(input, "barramundi").gills).toEqual({
      edge: 0.28,
      top: 0.17,
      bottom: -0.06,
      open: 0.006,
      rate: 1.1,
      curve: 0,
    });
  });

  it("bends the gill cover's edge back in the middle, if the manifest says", () => {
    const input = {
      name: "Barramundi",
      credit,
      gills: { edge: 0.28, top: 0.17, bottom: -0.06, curve: 3 },
    };

    expect(parseModelManifest(input, "barramundi").gills?.curve).toBe(3);
  });

  it("refuses gills whose top is below their bottom", () => {
    const input = { name: "Barramundi", credit, gills: { edge: 0.28, top: -0.1, bottom: 0.1 } };

    expect(() => parseModelManifest(input, "barramundi")).toThrow(/gills/);
  });

  it("finds the pectoral fins, swinging them as far as a calm fish does unless told otherwise", () => {
    const pectoral = {
      root: [
        [0.15, 0.06],
        [0.12, -0.08],
      ],
      side: 0.1,
      front: 0.17,
      back: -0.08,
      top: 0.13,
      bottom: -0.13,
    };
    const input = { name: "Clownfish", credit, fins: { pectoral } };

    expect(parseModelManifest(input, "clownfish").fins?.pectoral).toEqual({
      ...pectoral,
      rest: 30,
      sweep: 35,
    });
  });

  it("refuses a pectoral fin whose base runs upside down", () => {
    const pectoral = {
      root: [
        [0.12, -0.08],
        [0.15, 0.06],
      ],
      side: 0.1,
      front: 0.17,
      back: -0.08,
      top: 0.13,
      bottom: -0.13,
    };
    const input = { name: "Clownfish", credit, fins: { pectoral } };

    expect(() => parseModelManifest(input, "clownfish")).toThrow(/pectoral/);
  });

  it("refuses a pectoral fin whose front is behind its back", () => {
    const pectoral = {
      root: [
        [0.15, 0.06],
        [0.12, -0.08],
      ],
      side: 0.1,
      front: -0.08,
      back: 0.17,
      top: 0.13,
      bottom: -0.13,
    };
    const input = { name: "Clownfish", credit, fins: { pectoral } };

    expect(() => parseModelManifest(input, "clownfish")).toThrow(/pectoral/);
  });

  it("names the clips an animated model plays, in place and at its own pace", () => {
    const input = { name: "Sea turtle", credit, animations: { swim: "Armature|Swim" } };

    expect(parseModelManifest(input, "sea-turtle").animations).toEqual({
      swim: "Armature|Swim",
      speed: 0.3,
      inPlace: true,
    });
  });

  it("refuses animations that name no clip", () => {
    const input = { name: "Sea turtle", credit, animations: { speed: 0.5 } };

    expect(() => parseModelManifest(input, "sea-turtle")).toThrow(/animations/);
  });

  it("names the model in its error messages", () => {
    expect(() => parseModelManifest({ credit }, "barramundi")).toThrow(/barramundi/);
  });
});

describe("modelFileUrl", () => {
  it("resolves the model file inside the model's folder", () => {
    const manifest = parseModelManifest({ name: "Barramundi", credit }, "barramundi");

    expect(modelFileUrl("barramundi", manifest)).toBe("assets/species/barramundi/model.glb");
  });

  it("finds an animal's model in the animals' folder", () => {
    const manifest = parseModelManifest({ name: "Sea turtle", credit }, "sea-turtle");

    expect(modelFileUrl("sea-turtle", manifest, ANIMAL_MODELS_FOLDER)).toBe(
      "assets/animals/sea-turtle/model.glb",
    );
  });
});

describe("modelIdsOf", () => {
  it("lists each model used by the catalog once", () => {
    const input = catalogFixture();
    input.species[0]!.model = "barramundi";
    input.species[1]!.model = "barramundi";

    expect(modelIdsOf(parseCatalog(input))).toEqual(["barramundi"]);
  });
});
