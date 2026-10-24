import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFishRecipe } from "./fishRecipe";
import { moveHandle, recipeHandles } from "./fishHandles";

const platy = parseFishRecipe(
  JSON.parse(
    readFileSync(new URL("../../public/assets/species/platy/fish.json", import.meta.url), "utf8"),
  ),
  "platy",
);
const handle = (id: string) => recipeHandles(platy).find((each) => each.id === id);

describe("recipeHandles", () => {
  it("offers every point of the body's outline, the eye and each fin", () => {
    const ids = recipeHandles(platy).map((each) => each.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        "body.top.0",
        "body.bottom.8",
        "eye",
        "fin.dorsal.outline.2",
        "fin.pectoral.root",
      ]),
    );
  });

  it("puts each handle where its point is", () => {
    expect(handle("body.top.4")?.at).toEqual([0.11, 0.128]);
  });
});

describe("moveHandle", () => {
  it("moves a fin's outline point where it is dropped", () => {
    const dorsal = handle("fin.dorsal.outline.1");
    const moved = dorsal === undefined ? platy : moveHandle(platy, dorsal, [0.01, 0.23]);

    expect(moved.fins.find((fin) => fin.id === "dorsal")).toMatchObject({
      outline: expect.arrayContaining([[0.01, 0.23]]) as unknown,
    });
  });

  it("keeps the body's outline running from the snout back, between its neighbours", () => {
    const point = handle("body.top.4");
    const moved = point === undefined ? platy : moveHandle(platy, point, [0.5, 0.13]);

    expect(moved.body.top[4]).toEqual([0.185, 0.13]);
  });

  it("moves the eye", () => {
    const eye = handle("eye");
    const moved = eye === undefined ? platy : moveHandle(platy, eye, [0.24, 0.04]);

    expect([moved.eye.x, moved.eye.z]).toEqual([0.24, 0.04]);
  });

  it("offers the corners of the open strain's shapes, and moves them", () => {
    const strain = platy.strains[0];
    const shaped = structuredClone(platy);
    shaped.strains[0] = {
      ...(strain ?? { id: "x", name: "x", body: [] }),
      body: [
        ...(strain?.body ?? []),
        {
          type: "shape",
          color: "#111111",
          points: [
            [0, 0.05],
            [-0.15, 0],
            [0, -0.05],
          ],
        },
      ],
    };
    const layer = (strain?.body.length ?? 0).toString();
    const corner = recipeHandles(shaped, 0).find((each) => each.id === `paint.0.${layer}.1`);
    const moved = corner === undefined ? shaped : moveHandle(shaped, corner, [-0.12, 0.01]);

    expect(moved.strains[0]?.body.at(-1)).toMatchObject({
      points: [
        [0, 0.05],
        [-0.12, 0.01],
        [0, -0.05],
      ],
    });
  });

  it("leaves the recipe it was given untouched", () => {
    const eye = handle("eye");
    if (eye !== undefined) moveHandle(platy, eye, [0.1, 0.1]);

    expect([platy.eye.x, platy.eye.z]).toEqual([0.235, 0.03]);
  });
});
