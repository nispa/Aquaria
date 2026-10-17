import { Vector3 } from "three";
import { createEventBus } from "../core/eventBus";
import { createHistory } from "../core/history";
import type { Logger } from "../core/logger";
import { createRng, type Rng } from "../core/rng";
import { createEditorPointerInput, type EditorPointerEvents } from "../input/editorPointer";
import type { ViewSpot } from "../input/pointer";
import { createEditorView, type ItemBall, type ItemBox } from "../render/editorView";
import {
  paintBlocks,
  pickBlock,
  supportBelow,
  type BlockCell,
  type BlockPick,
} from "../scene/blockEditing";
import { blockGrid, cellCount, decodeRuns, encodeRuns, regrid } from "../scene/blocks";
import type { ObjectCatalog } from "../scene/objectCatalog";
import type { ObjectManifest } from "../scene/objectManifest";
import {
  MATERIAL_ITEM_PREFIX,
  paletteScene,
  rockMaterialScene,
  withEnvironment,
} from "../scene/objectEntries";
import {
  moveItem,
  paintItems,
  pickItem,
  placeItem,
  recolorEntry,
  removeItem,
  resizeItem,
  settleItems,
  turnItem,
  type ItemRef,
  type LaidOutItem,
  type Scenery,
} from "../scene/sceneryEditing";
import type { BlocksSpec, Scene } from "../scene/schema";
import {
  layoutFlora,
  layoutProps,
  propTraitsOf,
  type Plant,
  type Prop,
  type RockSurface,
} from "../sim/layout";
import { propTop } from "../sim/obstacles";
import { looseRocksEntries, ridgeCells } from "../sim/ridgeBlocks";
import { createRockwork, LOOSE_ROCK } from "../sim/rockwork";
import { floorHeight } from "../sim/terrain";
import { createEditorBar, DEFAULT_DENSITY, type EditorTool } from "../ui/editorBar";
import { createPalette } from "../ui/palette";
import type { SceneryPortraitRequest } from "../ui/sceneryCards";
import { createSceneSettings, type RockLook } from "../ui/sceneSettings";

/**
 * Editing mode: the window shows the scene editor instead of the tank. The
 * viewer builds rock from blocks and sets down, moves, turns, resizes and
 * removes plants and objects from the palette, sets the scene's water,
 * floor, light and tank in the Scene tab, then saves (the tank is rebuilt
 * with the saved scene) or leaves without saving.
 */

export interface SceneEditorOptions {
  readonly canvas: HTMLCanvasElement;
  /** Where the tool bar and the palette go. */
  readonly root: HTMLElement;
  readonly scene: Scene;
  readonly objects: ObjectCatalog;
  readonly logger: Logger;
  /** Whether the scene is the viewer's own and may be overwritten or deleted. */
  readonly canSave: boolean;
  /** Surface material ids for the floor and the rock. */
  readonly materials: readonly string[];
  /** The bundled scenes whose environment the scene can take, and how to load one. */
  readonly environments: readonly { readonly id: string; readonly name: string }[];
  loadEnvironment(sceneId: string): Promise<Scene>;
  /** Draws pictures of a scene's scenery entries, like the panel's cards. */
  drawPortraits(scene: Scene, requests: readonly SceneryPortraitRequest[]): void;
  /** Saves the edited scene; returns why it could not, or undefined. */
  onSave(scene: Scene, asNew: boolean): string | undefined;
  /** Starts the editor again on this scene, e.g. after the tank was resized. */
  onReopen(scene: Scene): void;
  onExport(scene: Scene): void;
  onImport(file: File): void;
  onDelete(): void;
  onExit(): void;
}

export interface SceneEditor {
  resize(cssWidth: number, cssHeight: number): void;
  /** Shows a message in the tool bar, e.g. why an import failed; empty clears it. */
  showStatus(message: string): void;
  /** Draws a frame, rebuilding the rock and the scenery first if they changed. */
  render(): void;
  dispose(): void;
}

/** Block edge for a scene with no blocks yet, m. */
const DEFAULT_BLOCK_SIZE = 0.05;
/** The first blocks of a scene: a plain grey stone, layered. */
const DEFAULT_BLOCKS: Pick<BlocksSpec, "color" | "material"> = {
  color: "#8a8178",
  material: { id: "layered-rock", tileSize: 0.5, displacement: 0 },
};
/** Smallest ball round an item for picking it, m: tiny pebbles stay easy to hit. */
const MIN_PICK_RADIUS = 0.03;
/** A plant's spread, as a share of its height, for its selection box. */
const PLANT_SPREAD = 0.25;
/** A plant set down grows at most this share of the tank's height: reef kelp would not fit a tank. */
const MAX_PLANT_SHARE = 0.8;
/** An object set down is at most this share of the tank's height across: a reef boulder would fill a small one. */
const MAX_OBJECT_SHARE = 0.4;
/** The brush paints plants and objects within this many blocks per step of its size. */
const PAINT_REACH = 2;
/** Size of an object whose placement sets none, m, for the brush's spacing. */
const TYPICAL_SIZE = 0.3;
/** A plant's width as a share of its height, for the brush's spacing. */
const PLANT_WIDTH = 0.4;
const MIN_SPACING = 0.015;
const PAINT_SEED_OFFSET = 103;
/** How far inside a block a tap on its side counts, m. */
const SIDE_INSET = 0.001;
/** Starts the name offered for a bundled scene saved as the viewer's own. */
const OWN_PREFIX = "My ";
/** A rock material picked in the palette is laid on blocks like this, m. */
const ROCK_TILE = 0.5;
const ROCK_RELIEF = 0.02;
/** Changes undo can go back over. */
const UNDO_LIMIT = 100;
/** Seeds of the editor's layout of entries drawn at random, after the scene's seed. */
const FLORA_SEED_OFFSET = 101;
const PROPS_SEED_OFFSET = 102;
/** Seed of a ridge turned into blocks, after the scene's seed. */
const RIDGE_SEED_OFFSET = 104;

/** The scene with the edited blocks; without any solid block, none at all. */
function withBlocks(scene: Scene, size: number, cells: Uint8Array, look: RockLook): Scene {
  const rest: Scene = { ...scene };
  delete rest.blocks;
  if (!cells.includes(1)) return rest;
  return { ...rest, blocks: { ...look, size, runs: encodeRuns(cells) } };
}

const sameCell = (a: BlockCell | undefined, b: BlockCell): boolean =>
  a?.column === b.column && a.layer === b.layer && a.row === b.row;

const sameRef = (a: ItemRef, b: ItemRef | undefined): boolean =>
  a.section === b?.section && a.entry === b.entry && a.item === b.item;

/**
 * The height or size of an item set down, when the object's usual range does
 * not fit the tank: the range's middle, shrunk in proportion. Nothing when it
 * fits, so the item is drawn from its range like any other.
 */
function fitToTank(object: ObjectManifest, tankHeight: number): { height?: number; size?: number } {
  const plant = object.category === "plant";
  const range = plant ? object.traits.placement?.height : object.traits.placement?.size;
  const limit = tankHeight * (plant ? MAX_PLANT_SHARE : MAX_OBJECT_SHARE);
  if (range === undefined || range[1] <= limit) return {};
  const fitted = (((range[0] + range[1]) / 2) * limit) / range[1];
  return plant ? { height: fitted } : { size: fitted };
}

/** How wide one item of an object is, roughly, m: what the brush keeps them apart by. */
function itemWidth(object: ObjectManifest, tankHeight: number): number {
  const middle = (range: readonly [number, number] | undefined): number | undefined =>
    range === undefined ? undefined : (range[0] + range[1]) / 2;
  const fitted = fitToTank(object, tankHeight);
  if (object.category === "plant") {
    const height = fitted.height ?? middle(object.traits.placement?.height) ?? TYPICAL_SIZE;
    return height * PLANT_WIDTH;
  }
  return fitted.size ?? middle(object.traits.placement?.size) ?? TYPICAL_SIZE;
}

export function openSceneEditor(options: SceneEditorOptions): SceneEditor {
  const { canvas, scene, objects } = options;
  const { tank } = scene;
  const size = scene.blocks?.size ?? DEFAULT_BLOCK_SIZE;
  const grid = blockGrid(tank, size);
  const cells =
    scene.blocks === undefined
      ? new Uint8Array(cellCount(grid))
      : decodeRuns(scene.blocks.runs, cellCount(grid));
  const view = createEditorView({
    canvas,
    tank,
    grid,
    cells,
    floorColor: scene.floor.color,
    rockColor: scene.blocks?.color ?? DEFAULT_BLOCKS.color,
    backgroundColor: scene.water.color,
    logger: options.logger,
  });

  let tool: EditorTool = "add";
  /** The palette's choice, set down by the "place" tool. */
  let chosen: string | undefined;
  let radius = 0;
  let density = DEFAULT_DENSITY;
  const paintRng = createRng(scene.seed + PAINT_SEED_OFFSET);
  /** Where the brush last painted in this stroke, so a slow drag does not pile items up. */
  let lastDab: { x: number; z: number } | undefined;
  let topLayer = grid.layers - 1;
  /** The blocks as they were when the stroke began: a stroke paints one surface, never its own. */
  let strokeStart: Uint8Array | undefined;
  let lastPainted: BlockCell | undefined;
  let blocksChanged = false;
  /** Whether the stroke going on changed anything, for undo and for items to settle. */
  let strokeEdited = false;
  let scenery: Scenery = { flora: scene.flora, props: scene.props };
  let sceneryChanged = true;
  let selected: ItemRef | undefined;
  /** Whether the current stroke drags the selected item. */
  let dragging = false;
  let plants: Plant[] = [];
  let props: Prop[] = [];
  const origin = new Vector3();
  const direction = new Vector3();

  // The rock as plants and objects see it: the tops of the block columns.
  const elevationAt = (x: number, z: number, height = Infinity): number =>
    Math.max(
      supportBelow(tank, grid, cells, x, z, floorHeight(x, z) + height) - floorHeight(x, z),
      0,
    );
  const blockTops: RockSurface = {
    randomPoint(rng: Rng) {
      // Every column with a block in it, whatever its layer.
      const tops = new Set<number>();
      cells.forEach((cell, index) => {
        if (cell === 1) tops.add(index % (grid.columns * grid.rows));
      });
      const columns = [...tops];
      if (columns.length === 0) return undefined;
      const index = columns[rng.int(0, columns.length - 1)] ?? 0;
      return [
        -tank.width / 2 + ((index % grid.columns) + rng.next()) * size,
        -tank.depth + (Math.floor(index / grid.columns) + rng.next()) * size,
      ];
    },
    heightAt: (x, z) => elevationAt(x, z),
  };

  const relayout = (): void => {
    plants = layoutFlora(
      objects,
      tank,
      scenery.flora,
      createRng(scene.seed + FLORA_SEED_OFFSET),
      undefined,
      blockTops,
    );
    props = layoutProps(
      objects,
      tank,
      scenery.props,
      createRng(scene.seed + PROPS_SEED_OFFSET),
      undefined,
      blockTops,
    );
    view.setScenery(plants, props);
  };

  /** A ball and a box round every laid-out item, with its source, for picking and outlining. */
  const balls = (): { ball: ItemBall; box: ItemBox; ref: ItemRef }[] => [
    ...plants.flatMap((plant) => {
      if (plant.source === undefined) return [];
      const base = floorHeight(plant.x, plant.z) + (plant.elevation ?? 0);
      const middle = { x: plant.x, y: base + plant.height / 2, z: plant.z };
      const ball = { ...middle, radius: Math.max(plant.height / 2, MIN_PICK_RADIUS) };
      const box = {
        ...middle,
        halfWidth: Math.max(plant.height * PLANT_SPREAD, MIN_PICK_RADIUS),
        halfHeight: plant.height / 2,
      };
      return [{ ball, box, ref: plant.source }];
    }),
    ...props.flatMap((prop) => {
      if (prop.source === undefined) return [];
      const base = floorHeight(prop.x, prop.z) + (prop.elevation ?? 0);
      const top = propTop(prop);
      const middle = { x: prop.x, y: base + top / 2, z: prop.z };
      const ball = { ...middle, radius: Math.max(prop.size / 2, top / 2, MIN_PICK_RADIUS) };
      const box = { ...middle, halfWidth: prop.size / 2, halfHeight: top / 2 };
      return [{ ball, box, ref: prop.source }];
    }),
  ];

  /** Where the layout put the items of an entry, to keep them there when one is edited. */
  const laidOutOf = (ref: ItemRef): LaidOutItem[] =>
    ref.section === "flora"
      ? plants
          .filter((plant) => plant.source?.entry === ref.entry)
          .map(({ x, z, rotation, height }) => ({ x, z, rotation, height }))
      : props
          .filter((prop) => prop.source?.entry === ref.entry)
          .map(({ x, z, rotation, size: across }) => ({ x, z, rotation, size: across }));

  const editScenery = (next: Scenery): void => {
    scenery = next;
    sceneryChanged = true;
  };
  /** The color an item's entry shows: its own, or the first of its palette. */
  const colorOf = (ref: ItemRef): string | undefined => {
    const color = scenery[ref.section][ref.entry]?.color;
    return typeof color === "string" ? color : color?.[0];
  };
  const select = (ref: ItemRef | undefined): void => {
    selected = ref;
    bar.setSelected(ref !== undefined, ref === undefined ? undefined : colorOf(ref));
  };

  const pickAt = (spot: ViewSpot, against: Uint8Array = cells): BlockPick | undefined => {
    view.ray(spot.x, spot.y, origin, direction);
    return pickBlock(tank, grid, against, origin, direction, topLayer);
  };
  /**
   * Where an item goes for a tap: on the floor, on a block's top (with its
   * height), or, for a tap on a block's side, on the top of that column.
   */
  const groundAt = (spot: ViewSpot): { x: number; z: number; y?: number } | undefined => {
    const pick = pickAt(spot);
    if (pick === undefined) return undefined;
    if (pick.hit === undefined) return pick.up ? { x: pick.point.x, z: pick.point.z } : undefined;
    // Inside the block met, a hair from its faces, so a side's point is in its column.
    const inside = (value: number, start: number, index: number): number =>
      Math.min(
        Math.max(value, start + index * size + SIDE_INSET),
        start + (index + 1) * size - SIDE_INSET,
      );
    const x = inside(pick.point.x, -tank.width / 2, pick.hit.column);
    const z = inside(pick.point.z, -tank.depth, pick.hit.row);
    const top = pick.up ? pick.point.y : supportBelow(tank, grid, cells, x, z, Infinity);
    return { x, z, y: Math.max(top - floorHeight(x, z), 0) };
  };

  const blockTarget = (spot: ViewSpot): BlockCell | undefined => {
    const pick = pickAt(spot, strokeStart);
    return tool === "add" ? pick?.place : pick?.hit;
  };
  const paint = (cell: BlockCell): void => {
    if (sameCell(lastPainted, cell)) return;
    lastPainted = cell;
    if (paintBlocks(grid, cells, cell, radius, tool === "add" ? 1 : 0, topLayer)) {
      blocksChanged = true;
      strokeEdited = true;
    }
  };
  const hover = (spot: ViewSpot): void => {
    const blockTool = tool === "add" || tool === "remove";
    view.setCursor(
      blockTool ? blockTarget(spot) : undefined,
      tool === "add" ? "add" : "remove",
      radius,
    );
  };

  const press = (spot: ViewSpot): void => {
    if (tool === "add" || tool === "remove") {
      strokeStart = cells.slice();
      lastPainted = undefined;
      const cell = blockTarget(spot);
      if (cell !== undefined) paint(cell);
      hover(spot);
      return;
    }
    if (tool === "paint") {
      lastDab = undefined;
      dab(spot);
      return;
    }
    if (tool === "place") {
      const object = chosen === undefined ? undefined : objects.get(chosen);
      const ground = groundAt(spot);
      if (chosen === undefined || object === undefined || ground === undefined) return;
      const where = { ...ground, ...fitToTank(object, tank.height) };
      const placed = placeItem(scenery, chosen, object, where);
      editScenery(placed.scenery);
      select(placed.ref);
      remember();
      return;
    }
    view.ray(spot.x, spot.y, origin, direction);
    const candidates = balls();
    const hit = pickItem(
      candidates.map((candidate) => candidate.ball),
      origin,
      direction,
    );
    const ref = hit === undefined ? undefined : candidates[hit]?.ref;
    select(ref);
    dragging = ref !== undefined;
  };
  /** One dab of the brush: the palette's choice painted round the spot. */
  const dab = (spot: ViewSpot): void => {
    const object = chosen === undefined ? undefined : objects.get(chosen);
    const ground = groundAt(spot);
    if (chosen === undefined || object === undefined || ground === undefined) return;
    const reach = (radius + 1) * PAINT_REACH * size;
    if (
      lastDab !== undefined &&
      Math.hypot(lastDab.x - ground.x, lastDab.z - ground.z) < reach / 2
    ) {
      return;
    }
    lastDab = { x: ground.x, z: ground.z };
    const spacing = Math.max((itemWidth(object, tank.height) * 2) / density, MIN_SPACING);
    const fit = fitToTank(object, tank.height);
    const painted = paintItems(
      scenery,
      chosen,
      object,
      { x: ground.x, z: ground.z, radius: reach, spacing },
      (x, z) => {
        const elevation = elevationAt(x, z);
        return elevation > 0 ? { y: elevation, ...fit } : fit;
      },
      paintRng,
    );
    if (painted === scenery) return;
    editScenery(painted);
    strokeEdited = true;
  };
  const drag = (spot: ViewSpot): void => {
    if (tool === "paint") {
      dab(spot);
      return;
    }
    if (tool === "add" || tool === "remove") {
      const cell = blockTarget(spot);
      if (cell !== undefined) paint(cell);
      view.setCursor(cell, tool, radius);
      return;
    }
    if (tool !== "select" || !dragging || selected === undefined) return;
    const ground = groundAt(spot);
    if (ground === undefined) return;
    editScenery(moveItem(scenery, selected, laidOutOf(selected), ground));
    strokeEdited = true;
  };
  const release = (): void => {
    if (strokeStart !== undefined && strokeEdited) {
      // What stood on blocks that went comes down to the next support.
      editScenery(settleItems(scenery, (x, z, y) => elevationAt(x, z, y)));
    }
    if (strokeEdited) remember();
    strokeStart = undefined;
    strokeEdited = false;
    lastPainted = undefined;
    dragging = false;
  };

  const bus = createEventBus<EditorPointerEvents>();
  const input = createEditorPointerInput(canvas, bus);
  canvas.classList.add("editing");
  bus.on("editor-hover", hover);
  bus.on("editor-press", press);
  bus.on("editor-drag", drag);
  bus.on("editor-release", release);
  bus.on("editor-leave", () => {
    view.setCursor(undefined, "add", radius);
  });
  bus.on("editor-pan", ({ dx, dy }) => {
    view.pan(dx, dy);
  });
  bus.on("editor-zoom", ({ factor }) => {
    view.zoom(factor);
  });

  const editSelected = (edit: (ref: ItemRef, laidOut: LaidOutItem[]) => Scenery): void => {
    if (selected === undefined) return;
    editScenery(edit(selected, laidOutOf(selected)));
    remember();
  };

  // Undo and redo: the blocks and the scenery after every finished change.
  const snapshot = (): { cells: Uint8Array; scenery: Scenery } => ({
    cells: cells.slice(),
    scenery,
  });
  const history = createHistory(snapshot(), UNDO_LIMIT);
  /** Records the editor's state after a change. */
  function remember(): void {
    history.record(snapshot());
    bar.setHistory(history.canUndo(), history.canRedo());
  }
  const restore = (state: { cells: Uint8Array; scenery: Scenery } | undefined): void => {
    if (state === undefined) return;
    cells.set(state.cells);
    scenery = state.scenery;
    blocksChanged = true;
    sceneryChanged = true;
    select(undefined);
    bar.setHistory(history.canUndo(), history.canRedo());
  };
  const undo = (): void => {
    restore(history.undo());
  };
  const redo = (): void => {
    restore(history.redo());
  };
  const deleteSelected = (): void => {
    editSelected((ref, laidOut) => removeItem(scenery, ref, laidOut));
    select(undefined);
  };

  // The Scene tab's settings and the rock's look, kept apart from the blocks and the scenery.
  // A bundled scene is saved as the viewer's own: offer a name that tells them apart.
  let settings: Scene =
    options.canSave || scene.name.startsWith(OWN_PREFIX)
      ? scene
      : { ...scene, name: `${OWN_PREFIX}${scene.name}` };
  let rockLook: RockLook = scene.blocks ?? DEFAULT_BLOCKS;
  const recolorView = (): void => {
    view.setColors({
      floor: settings.floor.color,
      background: settings.water.color,
      rock: rockLook.color,
    });
  };
  /** The scene as edited so far. */
  const edited = (): Scene => ({
    ...withBlocks(settings, size, cells, rockLook),
    flora: [...scenery.flora],
    props: [...scenery.props],
  });
  const save = (asNew: boolean): void => {
    bar.showStatus(options.onSave(edited(), asNew) ?? "");
  };
  /** The procedural ridge, as blocks and loose rocks the editor can reshape. */
  const convertRidge = (): void => {
    const spec = settings.rockwork;
    if (spec === undefined) return;
    const ridge = createRockwork(
      tank,
      spec,
      createRng(settings.seed + RIDGE_SEED_OFFSET),
      () => tank.width / 2,
      propTraitsOf(objects.get(LOOSE_ROCK), LOOSE_ROCK),
    );
    ridgeCells(tank, grid, ridge).forEach((cell, index) => {
      if (cell === 1) cells[index] = 1;
    });
    if (scene.blocks === undefined) {
      rockLook = {
        color: spec.color,
        ...(spec.material === undefined ? {} : { material: spec.material }),
      };
      recolorView();
    }
    const rest: Scene = { ...settings };
    delete rest.rockwork;
    settings = rest;
    editScenery({ ...scenery, props: [...scenery.props, ...looseRocksEntries(ridge, spec)] });
    blocksChanged = true;
    remember();
  };
  // The bar and the palette share one column, so the palette always starts under the bar.
  const overlay = document.createElement("div");
  overlay.className = "editor-ui";
  options.root.append(overlay);
  const bar = createEditorBar(
    overlay,
    { layers: grid.layers, canSave: options.canSave, name: settings.name },
    {
      onTool(next) {
        tool = next;
        // The brush paints the palette's choice: keep it.
        if (next !== "paint") {
          chosen = undefined;
          palette.setChosen(undefined);
        }
        if (next !== "select") select(undefined);
      },
      onTurnItem(degrees) {
        editSelected((ref, laidOut) => turnItem(scenery, ref, laidOut, degrees));
      },
      onResizeItem(factor) {
        editSelected((ref, laidOut) => resizeItem(scenery, ref, laidOut, factor));
      },
      onDeleteItem: deleteSelected,
      onColorItem(color) {
        if (selected === undefined) return;
        editScenery(recolorEntry(scenery, selected, color));
        remember();
      },
      onUndo: undo,
      onRedo: redo,
      onBrush(next) {
        radius = next;
      },
      onDensity(next) {
        density = next;
      },
      onSlice(next) {
        topLayer = next;
        view.setSlice(next);
      },
      onSmooth(smooth) {
        view.setSmooth(smooth);
      },
      onTurn(quarters) {
        view.turn(quarters);
      },
      onZoom(factor) {
        view.zoom(factor);
      },
      onRename(name) {
        settings = { ...settings, name };
      },
      onSave() {
        save(false);
      },
      onSaveAsNew() {
        save(true);
      },
      onExit() {
        options.onExit();
      },
    },
  );
  const paletteItems = (category: "plant" | "object") =>
    objects.ids(category).map((id) => ({ id, name: objects.get(id)?.name ?? id }));
  const settingsTab = createSceneSettings(
    {
      scene,
      materials: options.materials,
      canDelete: options.canSave,
      environments: options.environments,
    },
    {
      onChange(next) {
        // Only the tab's own settings: the ridge, blocks and scenery are the editor's.
        const { seed, water, floor, backdrop, light, current } = next;
        settings = { ...settings, seed, water, floor, backdrop, light, current };
        recolorView();
      },
      onResizeTank(next) {
        const resized = blockGrid(next, size);
        const kept = regrid(grid, cells, resized);
        options.onReopen({
          ...withBlocks({ ...settings, tank: next }, size, kept, rockLook),
          flora: [...scenery.flora],
          props: [...scenery.props],
        });
      },
      onRockLook(look) {
        rockLook = look;
        recolorView();
      },
      onEnvironment(sceneId) {
        options
          .loadEnvironment(sceneId)
          .then((from) => {
            settings = withEnvironment(settings, from);
            // Start again, so every setting of the tab shows the biome's values.
            options.onReopen(edited());
          })
          .catch((error: unknown) => {
            bar.showStatus(error instanceof Error ? error.message : String(error));
          });
      },
      onConvertRidge: convertRidge,
      onExport() {
        options.onExport(edited());
      },
      onImport(file) {
        options.onImport(file);
      },
      onDelete() {
        options.onDelete();
      },
    },
  );
  /** "dark-slate" reads "Dark slate". */
  const materialName = (id: string): string =>
    id.charAt(0).toUpperCase() + id.slice(1).replaceAll("-", " ");
  const palette = createPalette(overlay, {
    groups: [
      { title: "Plants", items: paletteItems("plant") },
      { title: "Objects", items: paletteItems("object") },
      {
        title: "Rocks",
        items: options.materials.map((id) => ({
          id: `${MATERIAL_ITEM_PREFIX}${id}`,
          name: materialName(id),
        })),
      },
    ],
    settings: settingsTab,
    drawPortraits: (requests) => {
      const rocks = requests.filter((request) => request.key.startsWith(MATERIAL_ITEM_PREFIX));
      options.drawPortraits(
        paletteScene(scene, objects),
        requests.filter((request) => !rocks.includes(request)),
      );
      // One rock per material, keyed as the panel keys repeated kinds: rock, rock-2…
      options.drawPortraits(
        rockMaterialScene(scene, options.materials),
        rocks.map((request, index) => ({
          ...request,
          key: index === 0 ? "rock" : `rock-${String(index + 1)}`,
        })),
      );
    },
    onChoose(id) {
      if (id?.startsWith(MATERIAL_ITEM_PREFIX) === true) {
        // A rock card: build blocks of that rock.
        const material = id.slice(MATERIAL_ITEM_PREFIX.length);
        rockLook = {
          ...rockLook,
          material: { id: material, tileSize: ROCK_TILE, displacement: ROCK_RELIEF },
        };
        chosen = undefined;
        tool = "add";
        bar.setTool(tool);
        return;
      }
      chosen = id;
      if (id === undefined) tool = "select";
      else if (tool !== "paint") tool = "place";
      bar.setTool(tool);
      view.setCursor(undefined, "add", radius);
    },
  });

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") options.onExit();
    const command = event.ctrlKey || event.metaKey;
    if (command && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
    if (command && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selected !== undefined) {
      deleteSelected();
    }
  };
  window.addEventListener("keydown", onKey);

  return {
    resize(cssWidth, cssHeight) {
      view.resize(cssWidth, cssHeight);
    },
    showStatus(message) {
      bar.showStatus(message);
    },
    render() {
      if (blocksChanged) {
        blocksChanged = false;
        view.refresh();
        sceneryChanged = true;
      }
      if (sceneryChanged) {
        sceneryChanged = false;
        relayout();
      }
      const outline = balls().find((candidate) => sameRef(candidate.ref, selected));
      view.setSelection(outline?.box);
      view.render();
    },
    dispose() {
      window.removeEventListener("keydown", onKey);
      canvas.classList.remove("editing");
      input.dispose();
      bar.dispose();
      palette.dispose();
      overlay.remove();
      view.dispose();
    },
  };
}
