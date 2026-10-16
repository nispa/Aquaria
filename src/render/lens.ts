import {
  CircleGeometry,
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  RingGeometry,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";

/**
 * The magnifier: a round window over the pointer that shows the tank
 * MAGNIFICATION times larger, to look at the fish up close. A second camera
 * stands where the main one does and looks along the line of sight through
 * the pointer with a narrower field of view; its picture is drawn into a
 * small texture and laid as a disc over the finished frame.
 */

/** How many times larger the lens shows the tank. */
const MAGNIFICATION = 3;
/** Radius of the lens on screen, CSS pixels. */
const RADIUS_PX = 140;
/** Pixels of the lens picture per CSS pixel of the lens, for a sharp view on dense screens. */
const SHARPNESS = 2;
const SEGMENTS = 64;
/** The rim around the lens, as a share of its radius. */
const RIM_WIDTH = 0.035;
const RIM_COLOR = 0xbfe8ff;
const RIM_OPACITY = 0.85;

const DEGREES = 180 / Math.PI;

/**
 * The lens camera's vertical field of view, degrees: the view behind a lens
 * `diameterPx` across on a screen `screenPx` tall (seen with `fov`), made
 * `magnification` times larger.
 */
export function lensFov(
  fov: number,
  magnification: number,
  diameterPx: number,
  screenPx: number,
): number {
  const half = (Math.tan(fov / 2 / DEGREES) * (diameterPx / screenPx)) / magnification;
  return 2 * Math.atan(half) * DEGREES;
}

/**
 * How much to stretch a unit disc, in normalized device coordinates, so that
 * it is `radiusPx` CSS pixels across on a `width` × `height` screen.
 */
export function lensDiscScale(
  radiusPx: number,
  width: number,
  height: number,
): { readonly x: number; readonly y: number } {
  return { x: radiusPx / (width / 2), y: radiusPx / (height / 2) };
}

export interface Lens {
  /** Points the lens at a spot of the view (normalized device coordinates), or hides it. */
  aim(point: Vector2 | undefined): void;
  /** Draws the lens over the frame just rendered, when it is shown. */
  render(renderer: WebGLRenderer, world: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
}

export function createLens(): Lens {
  const pictureSize = RADIUS_PX * 2 * SHARPNESS;
  // Linear HDR: the disc's material tone-maps it like the rest of the frame.
  const target = new WebGLRenderTarget(pictureSize, pictureSize, {
    type: HalfFloatType,
    samples: 4,
  });
  const lensCamera = new PerspectiveCamera(1, 1, 0.05, 80);
  const raycaster = new Raycaster();
  const lookAt = new Vector3();
  const overlay = new Scene();
  const overlayCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const discGeometry = new CircleGeometry(1, SEGMENTS);
  const discMaterial = new MeshBasicMaterial({ map: target.texture });
  const disc = new Mesh(discGeometry, discMaterial);
  const rimGeometry = new RingGeometry(1, 1 + RIM_WIDTH, SEGMENTS);
  const rimMaterial = new MeshBasicMaterial({
    color: RIM_COLOR,
    transparent: true,
    opacity: RIM_OPACITY,
  });
  const rim = new Mesh(rimGeometry, rimMaterial);
  overlay.add(disc, rim);
  const aimed = new Vector2();
  let shown = false;
  const size = new Vector2();

  return {
    aim(point) {
      shown = point !== undefined;
      if (point !== undefined) aimed.copy(point);
    },
    render(renderer, world, camera) {
      if (!shown) return;
      // The lens looks from the eye along the line of sight through the pointer.
      raycaster.setFromCamera(aimed, camera);
      lensCamera.position.copy(camera.position);
      renderer.getSize(size);
      lensCamera.fov = lensFov(camera.fov, MAGNIFICATION, RADIUS_PX * 2, size.y);
      lensCamera.near = camera.near;
      lensCamera.far = camera.far;
      lensCamera.updateProjectionMatrix();
      lensCamera.lookAt(lookAt.copy(camera.position).add(raycaster.ray.direction));

      // The shadows were drawn for this frame already.
      const updateShadows = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(target);
      renderer.render(world, lensCamera);
      renderer.setRenderTarget(null);
      renderer.shadowMap.autoUpdate = updateShadows;

      const scale = lensDiscScale(RADIUS_PX, size.x, size.y);
      disc.position.set(aimed.x, aimed.y, 0);
      disc.scale.set(scale.x, scale.y, 1);
      rim.position.copy(disc.position);
      rim.scale.copy(disc.scale);
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(overlay, overlayCamera);
      renderer.autoClear = autoClear;
    },
    dispose() {
      target.dispose();
      discGeometry.dispose();
      discMaterial.dispose();
      rimGeometry.dispose();
      rimMaterial.dispose();
    },
  };
}
