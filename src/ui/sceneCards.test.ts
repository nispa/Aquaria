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
        firstOfGroup: true,
      },
      {
        id: "my-night-reef",
        name: "Night reef",
        group: "My scenes",
        picture: undefined,
        selected: false,
        firstOfGroup: true,
      },
    ]);
  });

  it("marks only the first card of a group, where the panel names the group", () => {
    const large = {
      name: "Large",
      scenes: [
        { id: "home-reef", name: "Home reef" },
        { id: "iwagumi", name: "Iwagumi" },
      ],
    };

    const cards = sceneCardList([large], "home-reef", picture);

    expect(cards.map((card) => card.firstOfGroup)).toEqual([true, false]);
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
