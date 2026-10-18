import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { floorHeight } from "../sim/terrain";

/** Width of the posts, m, and their depth. */
const POST = 0.1;
/** The posts stand this share of the visible half width out from the middle. */
const POST_REACH = 0.88;
/** How far the posts rise above the surface and sink below the sand, m. */
const OVERHANG = 0.6;
/** The dark stand in front of the glass: how far above the sand under it, and how far it comes out, m. */
const STAND_CLEARANCE = 0.02;
const STAND_DEPTH = 3;
/** Spacing of the sand samples the stand is raised over, m. */
const SAND_SAMPLE = 0.1;
const STAND_HEIGHT = 1;
const FRAME_COLOR = "#121619";
/** The stand is outside the water and in shade: matte and nearly black. */
const STAND_COLOR = "#07090a";

export interface TankFrame {
  readonly object: Group;
  /** Sets the posts near the edges of what the camera sees at the glass. */
  layout(visibleHalfWidth: number): void;
  dispose(): void;
}

/**
 * The tank's frame, as on the Aquaria poster: two dark posts on the glass
 * near the edges of the view, and the dark stand the tank rests on, in
 * front of the glass, hiding the sand outside it. It turns the view into a
 * tank seen in a room; the "Tank frame" switch shows or hides it.
 */
export function createTankFrame(tank: { readonly height: number }): TankFrame {
  const object = new Group();
  object.name = "tank-frame";
  const material = new MeshStandardMaterial({
    color: FRAME_COLOR,
    metalness: 0.5,
    roughness: 0.35,
  });
  const post = new BoxGeometry(POST, tank.height + 2 * OVERHANG, POST);
  // Wide enough for any screen; the camera never sees its ends.
  const stand = new BoxGeometry(1, STAND_HEIGHT, STAND_DEPTH);
  const posts = [-1, 1].map((side) => {
    const mesh = new Mesh(post, material);
    mesh.position.set(side, tank.height / 2, POST / 2);
    mesh.userData.side = side;
    return mesh;
  });
  const standMaterial = new MeshBasicMaterial({ color: STAND_COLOR });
  const standMesh = new Mesh(stand, standMaterial);
  standMesh.position.set(0, -STAND_HEIGHT / 2, STAND_DEPTH / 2);
  object.add(...posts, standMesh);
  object.visible = false;
  return {
    object,
    layout(visibleHalfWidth) {
      for (const mesh of posts) {
        mesh.position.x = Number(mesh.userData.side) * visibleHalfWidth * POST_REACH;
      }
      standMesh.scale.x = visibleHalfWidth * 4;
      // Over the highest sand in front of the glass, so no dune pokes through.
      let top = 0;
      for (let x = -visibleHalfWidth * 2; x <= visibleHalfWidth * 2; x += SAND_SAMPLE) {
        for (let z = 0; z <= STAND_DEPTH; z += SAND_SAMPLE) top = Math.max(top, floorHeight(x, z));
      }
      standMesh.position.y = top + STAND_CLEARANCE - STAND_HEIGHT / 2;
    },
    dispose() {
      post.dispose();
      stand.dispose();
      material.dispose();
      standMaterial.dispose();
    },
  };
}
