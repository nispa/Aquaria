import { describe, expect, it } from "vitest";
import { SceneValidationError } from "./parse";
import {
  chosenSound,
  parseSoundIndex,
  parseSoundManifest,
  soundChoices,
  soundFileUrl,
} from "./soundManifest";

const underwater = {
  name: "Under the sea",
  file: "underwater.mp3",
  credit: {
    author: "Kinoton",
    source: "https://freesound.org/people/Kinoton/sounds/393819/",
    license: "CC0-1.0",
  },
};

describe("sound manifest", () => {
  it("plays a recording at its full level unless it says otherwise", () => {
    expect(parseSoundManifest(underwater, "underwater").level).toBe(1);
  });

  it("finds the recording inside its folder", () => {
    const manifest = parseSoundManifest(underwater, "underwater");

    expect(soundFileUrl("underwater", manifest)).toBe("sounds/underwater/underwater.mp3");
  });

  it("refuses a recording without a credit", () => {
    const uncredited = { name: underwater.name, file: underwater.file };

    expect(() => parseSoundManifest(uncredited, "underwater")).toThrow(SceneValidationError);
  });

  it("refuses a file outside its folder", () => {
    expect(() =>
      parseSoundManifest({ ...underwater, file: "../secret.mp3" }, "underwater"),
    ).toThrow(/file/);
  });

  it("refuses a license that does not allow reuse", () => {
    const credit = { ...underwater.credit, license: "CC-BY-NC-4.0" };

    expect(() => parseSoundManifest({ ...underwater, credit }, "underwater")).toThrow(/license/);
  });
});

describe("sound index", () => {
  it("lists the recorded ambiences by folder", () => {
    expect(parseSoundIndex({ sounds: ["underwater-sea", "aquarium-pump"] })).toEqual([
      "underwater-sea",
      "aquarium-pump",
    ]);
  });

  it("refuses a folder name with a path in it", () => {
    expect(() => parseSoundIndex({ sounds: ["../secret"] })).toThrow(SceneValidationError);
  });
});

describe("choosing the water's sound", () => {
  const sounds = [
    { id: "underwater-sea", name: "Under the sea" },
    { id: "aquarium-pump", name: "Aquarium pump" },
  ];

  it("offers the scene's own first, named after what it plays, then every recording and the synthesized water", () => {
    expect(soundChoices(sounds, "underwater-sea")).toEqual([
      { value: "scene", label: "The scene's: Under the sea + bubbles" },
      { value: "underwater-sea", label: "Under the sea + bubbles" },
      { value: "aquarium-pump", label: "Aquarium pump + bubbles" },
      { value: "synth", label: "Synthesized water + bubbles" },
      { value: "classic", label: "Bubbling water (the first sound)" },
    ]);
  });

  it("names the scene's own the synthesized water when the scene has no recording", () => {
    expect(soundChoices(sounds, undefined)[0]?.label).toBe(
      "The scene's: Synthesized water + bubbles",
    );
  });

  it("plays the scene's recording unless the viewer chose another sound", () => {
    expect(chosenSound(undefined, "underwater-sea", sounds)).toEqual({
      kind: "recording",
      id: "underwater-sea",
    });
  });

  it("plays the recording the viewer chose, whatever the scene's", () => {
    expect(chosenSound("aquarium-pump", "underwater-sea", sounds)).toEqual({
      kind: "recording",
      id: "aquarium-pump",
    });
  });

  it("plays the first sound when the viewer chose it", () => {
    expect(chosenSound("classic", "underwater-sea", sounds)).toEqual({ kind: "classic" });
  });

  it("falls back to the synthesized water for a recording that is not there", () => {
    expect(chosenSound("thunderstorm", undefined, sounds)).toEqual({ kind: "synth" });
  });
});
