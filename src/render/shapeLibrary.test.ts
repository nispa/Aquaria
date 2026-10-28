import { BoxGeometry } from "three";
import { describe, expect, it } from "vitest";
import type { ShapeRequest } from "./sceneryShapes";
import { createShapeLibrary } from "./shapeLibrary";

const rock: ShapeRequest = { kind: "prop", generator: "rock", variant: 0 };
const shell: ShapeRequest = { kind: "prop", generator: "shell", variant: 0 };

/** A library whose builder counts how often it grows a shape. */
function setup() {
  const built: ShapeRequest[] = [];
  const library = createShapeLibrary((request) => {
    built.push(request);
    return new BoxGeometry();
  });
  return { library, built };
}

describe("shape library", () => {
  it("grows each shape once, however often it is asked for", () => {
    const { library, built } = setup();

    library.geometry(rock);
    library.geometry(rock);
    library.geometry(shell);

    expect(built).toEqual([rock, shell]);
  });

  it("gives every caller its own copy", () => {
    const { library } = setup();

    expect(library.geometry(rock)).not.toBe(library.geometry(rock));
  });

  it("grows the shapes again after it is disposed", () => {
    const { library, built } = setup();
    library.geometry(rock);

    library.dispose();
    library.geometry(rock);

    expect(built).toHaveLength(2);
  });
});
