import { describe, expect, it } from "vitest";
import {
  centerSquare,
  readScenePictures,
  scenePictureUrl,
  writeScenePicture,
} from "./scenePictures";

const picture = "data:image/jpeg;base64,AAAA";

describe("scene pictures in storage", () => {
  it("keeps a picture per scene", () => {
    const stored = writeScenePicture(null, "my-reef", picture);

    expect(readScenePictures(stored)).toEqual({ "my-reef": picture });
  });

  it("forgets a scene's picture, so a fresh one is taken", () => {
    const stored = writeScenePicture(writeScenePicture(null, "my-reef", picture), "my-reef");

    expect(readScenePictures(stored)).toEqual({});
  });

  it("ignores what is not a JPEG picture", () => {
    const stored = JSON.stringify({ "my-reef": "javascript:alert(1)", "my-lake": picture });

    expect(readScenePictures(stored)).toEqual({ "my-lake": picture });
  });

  it("starts empty on missing or broken storage", () => {
    expect([readScenePictures(null), readScenePictures("{oops")]).toEqual([{}, {}]);
  });
});

describe("centerSquare", () => {
  it("takes the middle of a wide frame", () => {
    expect(centerSquare(1600, 900)).toEqual({ x: 350, y: 0, size: 900 });
  });

  it("takes the middle of a tall frame", () => {
    expect(centerSquare(900, 1600)).toEqual({ x: 0, y: 350, size: 900 });
  });
});

describe("scenePictureUrl", () => {
  const stored = { "my-reef": "data:image/jpeg;base64,AAAA" };

  it("shows a bundled scene's thumbnail", () => {
    expect(scenePictureUrl("reef", stored, "/")).toBe("/scenes/thumbnails/reef.jpg");
  });

  it("shows the picture kept in the browser for the viewer's own scene", () => {
    expect(scenePictureUrl("my-reef", stored, "/")).toBe("data:image/jpeg;base64,AAAA");
  });

  it("shows no picture for an own scene that has none yet", () => {
    expect(scenePictureUrl("my-lagoon", stored, "/")).toBeUndefined();
  });
});
