import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Raycaster,
  Scene as World,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Logger } from "../core/logger";
import type { BlockCell } from "../scene/blockEditing";
import type { BlockGrid } from "../scene/blocks";
import type { Plant, Prop } from "../sim/layout";
import { createAssetLoaders } from "./assetLoaders";
import { blockMesh } from "./blockMesh";
import { blockyMesh, isometricView } from "./editorFraming";
import { createFloraRenderer, type FloraRenderer } from "./floraRenderer";
import { createPropRenderer, type PropRenderer } from "./propRenderer";
import { createSurfaceLibrary } from "./surfaceLibrary";
import { neutralWaterUniforms } from "./uniforms";

/**
 * The scene editor's view: the tank from above at an angle (isometric,
 * orthographic), its floor with the block grid, and the rock built from
 * blocks, as cubes or smoothed. No fish, water or effects: what is edited
 * is plain to see. It draws on the aquarium's canvas while editing.
 */

export interface EditorViewOptions {
  readonly canvas: HTMLCanvasElement;
  readonly tank: { readonly width: number; readonly height: number; readonly depth: number };
  readonly grid: BlockGrid;
  /** The blocks being edited; the editor changes them, then calls `refresh`. */
  readonly cells: Uint8Array;
  readonly floorColor: string;
  readonly rockColor: string;
  readonly backgroundColor: string;
  readonly logger: Logger;
}

/** A ball round a plant or object, for picking it, m. */
export interface ItemBall {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
}

/** The box round a plant or object, outlined when it is selected, m. */
export interface ItemBox {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

/** What the cursor shows: where a block goes, or which one is removed. */
export type CursorMode = "add" | "remove";

export interface EditorView {
  /** Rebuilds the rock after the cells changed. */
  refresh(): void;
  /** Smooth rock, as in the tank, or plain cubes. */
  setSmooth(smooth: boolean): void;
  /** Shows the layers up to this one; the ones above are sliced away. */
  setSlice(topLayer: number): void;
  /** Turns the view round the tank by quarter turns. */
  turn(quarters: number): void;
  /** Zooms in (> 1) or out (< 1) about the middle of the view. */
  zoom(factor: number): void;
  /** Moves the view by a share of its size (normalized device units). */
  pan(dx: number, dy: number): void;
  /** The ray through a spot on the view (normalized device coordinates), in tank coordinates. */
  ray(x: number, y: number, origin: Vector3, direction: Vector3): void;
  /** Shows these plants and objects, as they will stand in the tank. */
  setScenery(plants: readonly Plant[], props: readonly Prop[]): void;
  /** Outlines the selected plant or object; none when undefined. */
  setSelection(box: ItemBox | undefined): void;
  /** Outlines the block(s) a tool would change; none when undefined. */
  setCursor(cell: BlockCell | undefined, mode: CursorMode, radius: number): void;
  resize(cssWidth: number, cssHeight: number): void;
  render(): void;
  dispose(): void;
}

const MAX_PIXEL_RATIO = 2;
const GRID_COLOR = 0xffffff;
const GRID_OPACITY = 0.18;
const TANK_EDGE_OPACITY = 0.45;
const ADD_COLOR = 0x6ee7a0;
const REMOVE_COLOR = 0xff6b6b;
const SLICE_COLOR = 0xffd166;
const SELECTION_COLOR = 0xffd166;
const SKY_LIGHT = 1.6;
const SUN_LIGHT = 1.4;
const SKY_GROUND = 0x404040;
const ROUGHNESS = 0.9;
/** Smooth rock in the editor: as in the tank, without the noise. */
const SMOOTHING = 3;
/** The camera stands this many tank sizes away: far enough never to clip. */
const CAMERA_DISTANCE = 4;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
/** The floor sits a hair below the blocks, so they never flicker into it. */
const FLOOR_DROP = 0.0005;
const QUARTERS = 4;

/** Lines of the block grid over the floor. */
function gridLines(
  tank: EditorViewOptions["tank"],
  grid: BlockGrid,
  height: number,
): BufferGeometry {
  const minX = -tank.width / 2;
  const minZ = -tank.depth;
  const maxX = minX + grid.columns * grid.size;
  const maxZ = minZ + grid.rows * grid.size;
  const points: number[] = [];
  for (let column = 0; column <= grid.columns; column += 1) {
    const x = minX + column * grid.size;
    points.push(x, height, minZ, x, height, maxZ);
  }
  for (let row = 0; row <= grid.rows; row += 1) {
    const z = minZ + row * grid.size;
    points.push(minX, height, z, maxX, height, z);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  return geometry;
}

export function createEditorView(options: EditorViewOptions): EditorView {
  const { canvas, tank, grid, cells } = options;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  const loaders = createAssetLoaders(renderer);
  const surfaces = createSurfaceLibrary((url) => loaders.textures.loadAsync(url), options.logger);
  // No water in the editor: plants and objects as they are, without caustics.
  const water = neutralWaterUniforms();
  let flora: FloraRenderer | undefined;
  let props: PropRenderer | undefined;
  const world = new World();
  world.background = new Color(options.backgroundColor);
  const sun = new DirectionalLight(0xffffff, SUN_LIGHT);
  sun.position.set(-tank.width, tank.height * 3, tank.depth * 2);
  world.add(new HemisphereLight(0xffffff, SKY_GROUND, SKY_LIGHT), sun);

  const floorGeometry = new PlaneGeometry(tank.width, tank.depth);
  floorGeometry.rotateX(-Math.PI / 2);
  floorGeometry.translate(0, -FLOOR_DROP, -tank.depth / 2);
  const floorMaterial = new MeshStandardMaterial({
    color: new Color(options.floorColor),
    roughness: 1,
  });
  const lineMaterial = new LineBasicMaterial({
    color: GRID_COLOR,
    transparent: true,
    opacity: GRID_OPACITY,
  });
  const floorGrid = new LineSegments(gridLines(tank, grid, 0), lineMaterial);
  const tankBox = new BoxGeometry(tank.width, tank.height, tank.depth);
  tankBox.translate(0, tank.height / 2, -tank.depth / 2);
  const tankEdges = new EdgesGeometry(tankBox);
  tankBox.dispose();
  const tankMaterial = new LineBasicMaterial({
    color: GRID_COLOR,
    transparent: true,
    opacity: TANK_EDGE_OPACITY,
  });
  const sliceMaterial = new LineBasicMaterial({ color: SLICE_COLOR });
  let sliceGrid: LineSegments | undefined;
  world.add(
    new Mesh(floorGeometry, floorMaterial),
    floorGrid,
    new LineSegments(tankEdges, tankMaterial),
  );

  const rockMaterial = new MeshStandardMaterial({
    color: new Color(options.rockColor),
    roughness: ROUGHNESS,
  });
  const rock = new Mesh(new BufferGeometry(), rockMaterial);
  const sceneryGroup = new Group();
  world.add(rock, sceneryGroup);

  const unitCube = new BoxGeometry(1, 1, 1);
  const cubeEdges = new EdgesGeometry(unitCube);
  unitCube.dispose();
  const cursorMaterial = new LineBasicMaterial({ color: ADD_COLOR, depthTest: false });
  const cursor = new LineSegments(cubeEdges, cursorMaterial);
  cursor.renderOrder = 1;
  cursor.visible = false;
  world.add(cursor);
  const selectionMaterial = new LineBasicMaterial({ color: SELECTION_COLOR, depthTest: false });
  const selection = new LineSegments(cubeEdges, selectionMaterial);
  selection.renderOrder = 1;
  selection.visible = false;
  world.add(selection);

  const camera = new OrthographicCamera();
  let smooth = false;
  let topLayer = grid.layers - 1;
  let quarter = 0;
  let aspect = 1;
  const panOffset = new Vector2();
  const right = new Vector3();
  const up = new Vector3();
  const look = new Vector3();
  const reach = Math.max(tank.width, tank.height, tank.depth) * CAMERA_DISTANCE;

  const placeCamera = (): void => {
    const view = isometricView(tank, quarter, aspect);
    right.crossVectors(view.forward, camera.up).normalize();
    up.crossVectors(right, view.forward);
    look
      .copy(view.target)
      .addScaledVector(right, panOffset.x * view.halfHeight * aspect)
      .addScaledVector(up, panOffset.y * view.halfHeight);
    camera.position.copy(look).addScaledVector(view.forward, -reach);
    camera.lookAt(look);
    camera.left = -view.halfHeight * aspect;
    camera.right = view.halfHeight * aspect;
    camera.top = view.halfHeight;
    camera.bottom = -view.halfHeight;
    camera.near = 0;
    camera.far = reach * 2;
    camera.updateProjectionMatrix();
  };

  const refresh = (): void => {
    let positions: Float32Array;
    let indices: Uint32Array;
    let normals: Float32Array | undefined;
    if (smooth) {
      const shown = cells.slice();
      shown.fill(0, (topLayer + 1) * grid.rows * grid.columns);
      ({ positions, indices } = blockMesh(tank, grid, shown, {
        smoothing: SMOOTHING,
        roughness: 0,
        seed: 0,
      }));
    } else {
      ({ positions, indices, normals } = blockyMesh(tank, grid, cells, topLayer));
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));
    if (normals === undefined) geometry.computeVertexNormals();
    else geometry.setAttribute("normal", new BufferAttribute(normals, 3));
    rock.geometry.dispose();
    rock.geometry = geometry;
  };

  const raycaster = new Raycaster();
  const spot = new Vector2();

  placeCamera();
  refresh();

  return {
    refresh,
    setScenery(plants, items) {
      flora?.dispose();
      props?.dispose();
      flora = createFloraRenderer(plants, water);
      props = createPropRenderer(items, water, surfaces);
      sceneryGroup.clear();
      sceneryGroup.add(flora.object, props.object);
    },
    setSelection(box) {
      selection.visible = box !== undefined;
      if (box === undefined) return;
      selection.position.set(box.x, box.y, box.z);
      selection.scale.set(box.halfWidth * 2, box.halfHeight * 2, box.halfWidth * 2);
    },
    setSmooth(next) {
      smooth = next;
      refresh();
    },
    setSlice(next) {
      topLayer = Math.min(Math.max(next, 0), grid.layers - 1);
      if (sliceGrid !== undefined) {
        world.remove(sliceGrid);
        sliceGrid.geometry.dispose();
        sliceGrid = undefined;
      }
      if (topLayer < grid.layers - 1) {
        sliceGrid = new LineSegments(
          gridLines(tank, grid, (topLayer + 1) * grid.size),
          sliceMaterial,
        );
        world.add(sliceGrid);
      }
      refresh();
    },
    turn(quarters) {
      quarter = (((quarter + quarters) % QUARTERS) + QUARTERS) % QUARTERS;
      panOffset.set(0, 0);
      placeCamera();
    },
    zoom(factor) {
      camera.zoom = Math.min(Math.max(camera.zoom * factor, MIN_ZOOM), MAX_ZOOM);
      camera.updateProjectionMatrix();
    },
    pan(dx, dy) {
      panOffset.x -= dx / camera.zoom;
      panOffset.y -= dy / camera.zoom;
      placeCamera();
    },
    ray(x, y, origin, direction) {
      raycaster.setFromCamera(spot.set(x, y), camera);
      origin.copy(raycaster.ray.origin);
      direction.copy(raycaster.ray.direction);
    },
    setCursor(cell, mode, radius) {
      cursor.visible = cell !== undefined;
      if (cell === undefined) return;
      const span = (2 * Math.floor(radius) + 1) * grid.size;
      cursor.scale.setScalar(span);
      cursor.position.set(
        -tank.width / 2 + (cell.column + 0.5) * grid.size,
        (cell.layer + 0.5) * grid.size,
        -tank.depth + (cell.row + 0.5) * grid.size,
      );
      cursorMaterial.color.setHex(mode === "add" ? ADD_COLOR : REMOVE_COLOR);
    },
    resize(cssWidth, cssHeight) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
      renderer.setSize(cssWidth, cssHeight, false);
      aspect = cssWidth / cssHeight;
      placeCamera();
    },
    render() {
      renderer.render(world, camera);
    },
    dispose() {
      rock.geometry.dispose();
      rockMaterial.dispose();
      floorGeometry.dispose();
      floorMaterial.dispose();
      floorGrid.geometry.dispose();
      lineMaterial.dispose();
      tankEdges.dispose();
      tankMaterial.dispose();
      sliceGrid?.geometry.dispose();
      sliceMaterial.dispose();
      cubeEdges.dispose();
      cursorMaterial.dispose();
      selectionMaterial.dispose();
      flora?.dispose();
      props?.dispose();
      surfaces.dispose();
      loaders.dispose();
      renderer.dispose();
    },
  };
}
