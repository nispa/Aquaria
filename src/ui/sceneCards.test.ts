import { describe, expect, it } from "vitest";
import { sceneCardList, sceneInitial } from "./sceneCards";

const groups = [
  { name: "Demo", scenes: [{ id: "aquaria", name: "Aquaria" }] },
  { name: "My scenes", scenes: [{ id: "my-night-reef", name: "Night reef" }] },
];
const picture = (id: string) => (id.startsWith("my-") ? undefined : `scenes/thumbnails/${id}.jpg`);

describe("sceneCardList", () => {
  it("lists every scene in one row after another, group by group, with its picture", () => {
    const cards = sceneCardList(groups, "aquaria", picture);

    expect(cards).toEqual([
      {
        id: "aquaria",
        name: "Aquaria",
        group: "Demo",
        picture: "scenes/thumbnails/aquaria.jpg",
        selected: true,
      },
      {
        id: "my-night-reef",
        name: "Night reef",
        group: "My scenes",
        picture: undefined,
        selected: false,
      },
    ]);
  });
});

describe("sceneInitial", () => {
  it("is the first letter of the name, for scenes without a picture", () => {
    expect(sceneInitial("night reef")).toBe("N");
  });

  it("falls back to a wave for a name without letters", () => {
    expect(sceneInitial("  ")).toBe("~");
  });
});
