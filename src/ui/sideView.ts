import type { FishRecipe } from "../scene/fishRecipe";
import { moveHandle, recipeHandles, type Handle } from "../scene/fishHandles";
import { bodyOutline, finOutline, type SidePoint } from "../scene/fishOutline";

/**
 * The fish maker's side view: a fish recipe drawn from its left side, snout
 * to the right, over a grid in body lengths and a photograph of the real
 * fish, with its points to drag. Each drag gives the page a new recipe.
 */

/** Where a photograph lies under the fish: its centre and width in body lengths. */
export interface PhotoPlacement {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly opacity: number;
  /** Mirrored left to right, for a photograph of a fish facing left. */
  readonly flip: boolean;
}

export interface SideView {
  setRecipe(recipe: FishRecipe): void;
  /** The strain whose shapes are drawn and dragged. */
  setStrain(index: number): void;
  setPhoto(photo: HTMLImageElement | undefined, placement: PhotoPlacement): void;
  dispose(): void;
}

/** The part of the fish frame always in view, body lengths. */
const VIEW = { left: -0.75, right: 0.55, bottom: -0.5, top: 0.5 } as const;
const GRID_STEP = 0.05;
const LABEL_EVERY = 2;
/** How near a handle the pointer must be to take it, CSS pixels. */
const GRAB_RADIUS = 9;
const HANDLE_RADIUS = 4;
const COLORS = {
  background: "#0b1a26",
  grid: "rgba(140, 190, 230, 0.12)",
  axis: "rgba(140, 190, 230, 0.35)",
  label: "rgba(190, 220, 240, 0.7)",
  body: "#8fd3ff",
  bodyFill: "rgba(143, 211, 255, 0.18)",
  fin: "#ffb070",
  finFill: "rgba(255, 176, 112, 0.12)",
  eye: "#ffffff",
  gill: "#f0a0a0",
  active: "#ffe14d",
  paint: "#ff7ad9",
} as const;
const HANDLE_COLORS: Readonly<Record<Handle["kind"], string>> = {
  body: COLORS.body,
  eye: COLORS.eye,
  gill: COLORS.gill,
  fin: COLORS.fin,
  paint: COLORS.paint,
};

/**
 * @param onChange gets each new recipe while a point is dragged, then once
 * more with `finished` when it is let go.
 */
export function createSideView(
  canvas: HTMLCanvasElement,
  onChange: (recipe: FishRecipe, finished: boolean) => void,
): SideView {
  const context = canvas.getContext("2d");
  let recipe: FishRecipe | undefined;
  let strain = 0;
  let moved = false;
  let photo: HTMLImageElement | undefined;
  let placement: PhotoPlacement = { x: 0, z: 0, width: 1, opacity: 0.5, flip: false };
  let dragging: Handle | undefined;
  let hovered: Handle | undefined;

  /** Pixels per body length, and where the frame's origin lies on the canvas (CSS pixels). */
  const frame = (): { scale: number; originX: number; originY: number } => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const scale = Math.min(width / (VIEW.right - VIEW.left), height / (VIEW.top - VIEW.bottom));
    const middleX = (VIEW.left + VIEW.right) / 2;
    const middleZ = (VIEW.top + VIEW.bottom) / 2;
    return { scale, originX: width / 2 - middleX * scale, originY: height / 2 + middleZ * scale };
  };
  const toCanvas = ([x, z]: SidePoint): SidePoint => {
    const { scale, originX, originY } = frame();
    return [originX + x * scale, originY - z * scale];
  };
  const toFrame = (px: number, py: number): SidePoint => {
    const { scale, originX, originY } = frame();
    return [(px - originX) / scale, (originY - py) / scale];
  };

  const polygon = (points: readonly SidePoint[], stroke: string, fill: string): void => {
    if (context === null || points.length === 0) return;
    context.beginPath();
    points.forEach((point, index) => {
      const [px, py] = toCanvas(point);
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = stroke;
    context.lineWidth = 1.5;
    context.stroke();
  };

  const drawGrid = (): void => {
    if (context === null) return;
    context.font = "11px system-ui, sans-serif";
    const steps = (from: number, to: number): number[] => {
      const values: number[] = [];
      for (let index = Math.ceil(from / GRID_STEP); index * GRID_STEP <= to; index += 1)
        values.push(index);
      return values;
    };
    for (const index of steps(VIEW.left, VIEW.right)) {
      const x = index * GRID_STEP;
      const [px] = toCanvas([x, 0]);
      context.strokeStyle = index === 0 ? COLORS.axis : COLORS.grid;
      context.beginPath();
      context.moveTo(px, 0);
      context.lineTo(px, canvas.clientHeight);
      context.stroke();
      if (index % LABEL_EVERY === 0) {
        context.fillStyle = COLORS.label;
        context.fillText(`x ${x.toFixed(1)}`, px + 3, 12);
      }
    }
    for (const index of steps(VIEW.bottom, VIEW.top)) {
      const z = index * GRID_STEP;
      const [, py] = toCanvas([0, z]);
      context.strokeStyle = index === 0 ? COLORS.axis : COLORS.grid;
      context.beginPath();
      context.moveTo(0, py);
      context.lineTo(canvas.clientWidth, py);
      context.stroke();
      if (index % LABEL_EVERY === 0) {
        context.fillStyle = COLORS.label;
        context.fillText(`z ${z.toFixed(1)}`, 4, py - 3);
      }
    }
  };

  const drawPhoto = (): void => {
    if (context === null || photo === undefined || photo.naturalWidth === 0) return;
    const { scale } = frame();
    const width = placement.width * scale;
    const height = (width * photo.naturalHeight) / photo.naturalWidth;
    const [cx, cy] = toCanvas([placement.x, placement.z]);
    context.save();
    context.globalAlpha = placement.opacity;
    context.translate(cx, cy);
    if (placement.flip) context.scale(-1, 1);
    context.drawImage(photo, -width / 2, -height / 2, width, height);
    context.restore();
  };

  const draw = (): void => {
    if (context === null) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (
      canvas.width !== Math.round(width * ratio) ||
      canvas.height !== Math.round(height * ratio)
    ) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = COLORS.background;
    context.fillRect(0, 0, width, height);
    drawPhoto();
    drawGrid();
    if (recipe === undefined) return;
    for (const fin of recipe.fins) polygon(finOutline(recipe, fin), COLORS.fin, COLORS.finFill);
    polygon(bodyOutline(recipe), COLORS.body, COLORS.bodyFill);
    const { gills, eye } = recipe;
    if (gills !== undefined) {
      const [gx, gTop] = toCanvas([gills.edge, gills.top]);
      const [, gBottom] = toCanvas([gills.edge, gills.bottom]);
      context.setLineDash([4, 4]);
      context.strokeStyle = COLORS.gill;
      context.beginPath();
      context.moveTo(gx, gTop);
      context.lineTo(gx, gBottom);
      context.stroke();
      context.setLineDash([]);
    }
    context.setLineDash([3, 3]);
    for (const layer of recipe.strains[strain]?.body ?? []) {
      if (layer.type === "shape") polygon(layer.points, COLORS.paint, "transparent");
    }
    context.setLineDash([]);
    const [ex, ey] = toCanvas([eye.x, eye.z]);
    context.strokeStyle = COLORS.eye;
    context.beginPath();
    context.arc(ex, ey, eye.radius * frame().scale, 0, Math.PI * 2);
    context.stroke();
    for (const handle of recipeHandles(recipe, strain)) {
      const [hx, hy] = toCanvas(handle.at);
      const active = handle.id === dragging?.id || handle.id === hovered?.id;
      context.fillStyle = active ? COLORS.active : HANDLE_COLORS[handle.kind];
      context.beginPath();
      context.arc(hx, hy, active ? HANDLE_RADIUS + 2 : HANDLE_RADIUS, 0, Math.PI * 2);
      context.fill();
    }
  };

  const pointer = (event: PointerEvent): SidePoint => {
    const bounds = canvas.getBoundingClientRect();
    return [event.clientX - bounds.left, event.clientY - bounds.top];
  };
  const nearest = (px: number, py: number): Handle | undefined => {
    if (recipe === undefined) return undefined;
    let best: Handle | undefined;
    let bestDistance = GRAB_RADIUS;
    for (const handle of recipeHandles(recipe, strain)) {
      const [hx, hy] = toCanvas(handle.at);
      const distance = Math.hypot(hx - px, hy - py);
      if (distance <= bestDistance) {
        best = handle;
        bestDistance = distance;
      }
    }
    return best;
  };

  const onDown = (event: PointerEvent): void => {
    const [px, py] = pointer(event);
    dragging = nearest(px, py);
    if (dragging !== undefined) canvas.setPointerCapture(event.pointerId);
    draw();
  };
  const onMove = (event: PointerEvent): void => {
    const [px, py] = pointer(event);
    if (dragging === undefined || recipe === undefined) {
      const next = nearest(px, py);
      if (next?.id !== hovered?.id) {
        hovered = next;
        canvas.style.cursor = next === undefined ? "default" : "grab";
        draw();
      }
      return;
    }
    recipe = moveHandle(recipe, dragging, toFrame(px, py));
    dragging = recipeHandles(recipe, strain).find((handle) => handle.id === dragging?.id);
    moved = true;
    draw();
    onChange(recipe, false);
  };
  const onUp = (): void => {
    dragging = undefined;
    if (moved && recipe !== undefined) onChange(recipe, true);
    moved = false;
    draw();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  const resize = new ResizeObserver(draw);
  resize.observe(canvas);

  return {
    setRecipe(next) {
      recipe = next;
      draw();
    },
    setStrain(index) {
      strain = index;
      draw();
    },
    setPhoto(next, nextPlacement) {
      photo = next;
      placement = nextPlacement;
      draw();
    },
    dispose() {
      resize.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
    },
  };
}
