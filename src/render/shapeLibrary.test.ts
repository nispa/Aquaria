import { BoxGeometry } from "three";
import { describe, expect, it } from "vitest";
import type { ShapeRequest } from "./sceneryShapes";
import { createShapeLibrary } from "./shapeLibrary";

const coral: ShapeRequest = { kind: "prop", generator: "brain-coral", variant: 0 };
const kelp: ShapeRequest = { kind: "plant", generator: "kelp" };

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

    library.geometry(coral);
    library.geometry(coral);
    library.geometry(kelp);

    expect(built).toEqual([coral, kelp]);
  });

  it("gives every caller its own copy", () => {
    const { library } = setup();

    expect(library.geometry(coral)).not.toBe(library.geometry(coral));
  });

  it("grows the shapes again after it is disposed", () => {
    const { library, built } = setup();
    library.geometry(coral);

    library.dispose();
    library.geometry(coral);

    expect(built).toHaveLength(2);
  });
});
