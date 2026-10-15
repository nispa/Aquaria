import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { portraitFraming, type Box } from "./portraitFraming";

const FOV = 30;
const ASPECT = 1.6;
/** A one-body-length fish, nose towards +x, with fins above and below. */
const fish: Box = { min: [-0.5, -0.2, -0.06], max: [0.5, 0.25, 0.06] };

function cornersOnScreen(box: Box, aspect: number): Vector3[] {
  const framing = portraitFraming(box, aspect, FOV);
  const camera = new PerspectiveCamera(FOV, aspect, 0.01, 100);
  camera.position.set(...framing.position);
  camera.lookAt(...framing.target);
  camera.updateMatrixWorld();
  const corners: Vector3[] = [];
  for (const x of [box.min[0], box.max[0]])
    for (const y of [box.min[1], box.max[1]])
      for (const z of [box.min[2], box.max[2]]) corners.push(new Vector3(x, y, z).project(camera));
  return corners;
}

describe("portraitFraming", () => {
  it("keeps the whole body in view", () => {
    const corners = cornersOnScreen(fish, ASPECT);

    expect(corners.every((corner) => Math.abs(corner.x) <= 1 && Math.abs(corner.y) <= 1)).toBe(
      true,
    );
  });

  it("keeps a tall body in view on a narrow card", () => {
    const tall: Box = { min: [-0.5, -0.6, -0.05], max: [0.5, 0.7, 0.05] };

    const corners = cornersOnScreen(tall, 0.8);

    expect(corners.every((corner) => Math.abs(corner.x) <= 1 && Math.abs(corner.y) <= 1)).toBe(
      true,
    );
  });

  it("fills most of the card with a long body", () => {
    const corners = cornersOnScreen(fish, ASPECT);

    expect(Math.max(...corners.map((corner) => Math.abs(corner.x)))).toBeGreaterThan(0.8);
  });

  it("looks at the middle of the body", () => {
    const framing = portraitFraming(fish, ASPECT, FOV);

    expect(framing.target).toEqual([0, expect.closeTo(0.025), 0]);
  });

  it("looks from the front and a little above, like a diver", () => {
    const framing = portraitFraming(fish, ASPECT, FOV);

    expect(framing.position[2]).toBeGreaterThan(0);
    expect(framing.position[1]).toBeGreaterThan(framing.target[1]);
  });
});
