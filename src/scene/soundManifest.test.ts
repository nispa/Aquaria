import { describe, expect, it } from "vitest";
import { SceneValidationError } from "./parse";
import { parseSoundManifest, soundFileUrl } from "./soundManifest";

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
