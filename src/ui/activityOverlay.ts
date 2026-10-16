import { Vector3 } from "three";
import type { ActivityId } from "../scene/activities";
import type { ActivityState } from "../sim/behaviors";
import { isScribbling, spinOf, type Gesture } from "../sim/gesture";
import type { Obstacle } from "../sim/obstacles";
import type { Fish } from "../sim/simulation";

/**
 * What every fish is doing, written over it: its activity, or the spell the
 * viewer has cast on it. The fish nearest the pointer gets a card with its
 * details, and a line at the top says what the finger is drawing. Toggled
 * with A; C adds the collision shapes of the scenery (sim/obstacles).
 */

const COLORS: Readonly<Record<ActivityId, string>> = {
  wander: "rgba(255, 255, 255, 0.55)",
  inspect: "#5ad1ff",
  peck: "#ffb347",
  rest: "#9fa8ff",
};
const SPELL_COLORS = { hypnotized: "#d58cff", dizzy: "#7dff9b", tickled: "#ff6fb5" } as const;
const HIDING_COLOR = "#c8c8c8";
const FONT = "12px system-ui, sans-serif";
const CARD_FONT = "13px system-ui, sans-serif";
/** Labels sit this far above the fish, CSS pixels. */
const LABEL_OFFSET = 10;
/** The card goes to the fish nearest the pointer, within this many CSS pixels. */
const CARD_REACH = 150;
const CARD_PADDING = 8;
const CARD_LINE = 17;
const CARD_OFFSET = 18;
const HEADER_X = 16;
const HEADER_Y = 24;
const PERCENT = 100;
const OBSTACLE_COLOR = "rgba(255, 120, 80, 0.6)";
/** Each obstacle is outlined by three rings of this many segments. */
const OUTLINE_SEGMENTS = 24;
const OUTLINE_RINGS = 3;
const CENTIMETERS = 100;

export function activityColor(id: ActivityId): string {
  return COLORS[id];
}

/** Short text for an activity: the time left for wandering or resting, pecks left for pecking. */
export function activityLabel(activity: ActivityState): string {
  if (activity.id === "wander" || activity.id === "rest") {
    return `${activity.id} ${Math.round(activity.timer)}s`;
  }
  if (activity.id === "peck") return `peck ×${activity.count}`;
  return activity.id;
}

/** The spell on a fish, most striking first, or undefined when there is none. */
function spellOf(fish: Fish): keyof typeof SPELL_COLORS | undefined {
  const { play } = fish;
  if (play.tickled > 0) return "tickled";
  if (play.hypnosis > 0) return "hypnotized";
  if (play.dizzy > 0) return "dizzy";
  return undefined;
}

function spellLabel(fish: Fish, spell: keyof typeof SPELL_COLORS): string {
  if (spell === "tickled") return "tickled!";
  if (spell === "hypnotized") return `hypnotized ${Math.round(fish.play.hypnosis * PERCENT)}%`;
  return `dizzy ${Math.round(fish.play.dizzy)}s`;
}

/** The one-line label over a fish: hiding, its spell, or else its activity. */
export function fishLabel(fish: Fish): string {
  if (fish.hiding > 0) return `hiding ${Math.round(fish.hiding)}s`;
  const spell = spellOf(fish);
  return spell === undefined ? activityLabel(fish.activity) : spellLabel(fish, spell);
}

function labelColor(fish: Fish): string {
  if (fish.hiding > 0) return HIDING_COLOR;
  const spell = spellOf(fish);
  return spell === undefined ? activityColor(fish.activity.id) : SPELL_COLORS[spell];
}

/** The details shown on the card of the fish nearest the pointer. */
export function fishDetails(fish: Fish): string[] {
  const { species } = fish;
  const speed = fish.velocity.length() / species.speed.cruise;
  const lines = [
    `${species.name} · ${Math.round(fish.length * CENTIMETERS)} cm`,
    `${species.swim.style} · ${activityLabel(fish.activity)}`,
    `speed ${speed.toFixed(1)}× cruise`,
    `full ${Math.round(fish.satiety * PERCENT)}% · fear ${Math.round(fish.fear * PERCENT)}%`,
  ];
  const spell = spellOf(fish);
  if (spell !== undefined) lines.push(spellLabel(fish, spell));
  return lines;
}

/** What the finger is drawing, given its spin (1, -1 or 0) and whether it scribbles. */
export function gestureLabel(spin: number, scribbling: boolean): string {
  if (spin > 0) return "finger: circles ↺";
  if (spin < 0) return "finger: circles ↻";
  return scribbling ? "finger: scribbling" : "finger: —";
}

/** Where a point in the tank shows on screen, as normalized device coordinates in `out`; false when off screen. */
/**
 * A point of an obstacle's outline, written into `out`: ring 0 goes round it
 * level, rings 1 and 2 over the top, across and along it; `angle` in radians.
 */
export function outlinePoint(
  obstacle: Obstacle,
  ring: number,
  angle: number,
  out: Vector3,
): Vector3 {
  const { center, radii, cos, sin } = obstacle;
  const first = Math.cos(angle);
  const second = Math.sin(angle);
  const x = ring === 2 ? 0 : first * radii.x;
  const y = ring === 0 ? 0 : second * radii.y;
  const z = ring === 0 ? second * radii.z : ring === 2 ? first * radii.z : 0;
  // Into the tank's frame, turned like the obstacle (see sim/obstacles).
  return out.set(center.x + x * cos + z * sin, center.y + y, center.z - x * sin + z * cos);
}

export type ScreenProjection = (point: Vector3, out: Vector3) => boolean;

export interface ActivityOverlay {
  /** Redraws the labels, and the obstacles when asked for, when shown. */
  draw(
    fish: readonly Fish[],
    gesture: Readonly<Gesture>,
    obstacles: readonly Obstacle[],
    project: ScreenProjection,
  ): void;
  dispose(): void;
}

export function createActivityOverlay(parent: HTMLElement): ActivityOverlay {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:5;display:none";
  parent.append(canvas);
  const context = canvas.getContext("2d");
  let shown = false;
  let shapes = false;
  let pointerX = Number.NaN;
  let pointerY = Number.NaN;
  const at = new Vector3();
  const to = new Vector3();
  const nearestAt = new Vector3();

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "c" || event.key === "C") shapes = !shapes;
    if (event.key !== "a" && event.key !== "A") return;
    shown = !shown;
    canvas.style.display = shown ? "block" : "none";
  };
  const onPointer = (event: PointerEvent): void => {
    pointerX = event.clientX;
    pointerY = event.clientY;
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("pointermove", onPointer);

  const toPixels = (point: Vector3, width: number, height: number): void => {
    point.set(((point.x + 1) / 2) * width, ((1 - point.y) / 2) * height, 0);
  };

  const drawObstacles = (
    draw: CanvasRenderingContext2D,
    obstacles: readonly Obstacle[],
    project: ScreenProjection,
    width: number,
    height: number,
  ): void => {
    draw.strokeStyle = OBSTACLE_COLOR;
    for (const obstacle of obstacles) {
      for (let ring = 0; ring < OUTLINE_RINGS; ring += 1) {
        draw.beginPath();
        let drawing = false;
        // The rings over the top stop at the base: the rest is in the sand.
        const sweep = ring === 0 ? Math.PI * 2 : Math.PI;
        for (let segment = 0; segment <= OUTLINE_SEGMENTS; segment += 1) {
          const angle = (segment / OUTLINE_SEGMENTS) * sweep;
          if (!project(outlinePoint(obstacle, ring, angle, at), at)) {
            drawing = false;
            continue;
          }
          toPixels(at, width, height);
          if (drawing) draw.lineTo(at.x, at.y);
          else draw.moveTo(at.x, at.y);
          drawing = true;
        }
        draw.stroke();
      }
    }
  };

  const drawCard = (draw: CanvasRenderingContext2D, fish: Fish, x: number, y: number): void => {
    const lines = fishDetails(fish);
    draw.font = CARD_FONT;
    draw.textAlign = "left";
    const width = Math.max(...lines.map((line) => draw.measureText(line).width)) + 2 * CARD_PADDING;
    const height = lines.length * CARD_LINE + CARD_PADDING;
    const left = x + CARD_OFFSET;
    const top = y - height / 2;
    draw.fillStyle = "rgba(5, 20, 30, 0.75)";
    draw.fillRect(left, top, width, height);
    draw.fillStyle = labelColor(fish);
    lines.forEach((line, index) => {
      draw.fillText(line, left + CARD_PADDING, top + CARD_LINE * (index + 1));
    });
  };

  return {
    draw(fish, gesture, obstacles, project) {
      if (!shown || context === null) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.clearRect(0, 0, width, height);
      if (shapes) drawObstacles(context, obstacles, project, width, height);
      context.font = FONT;
      context.textAlign = "center";
      let nearest: Fish | undefined;
      let nearestDistance = CARD_REACH;
      for (const member of fish) {
        if (member.state !== "swimming" || !project(member.position, at)) continue;
        toPixels(at, width, height);
        const distance = Math.hypot(at.x - pointerX, at.y - pointerY);
        if (distance < nearestDistance) {
          nearest = member;
          nearestDistance = distance;
          nearestAt.copy(at);
        }
        const { activity } = member;
        context.fillStyle = context.strokeStyle = labelColor(member);
        context.fillText(fishLabel(member), at.x, at.y - LABEL_OFFSET);
        if (activity.id === "wander" || !project(activity.target, to)) continue;
        toPixels(to, width, height);
        context.beginPath();
        context.moveTo(at.x, at.y);
        context.lineTo(to.x, to.y);
        context.stroke();
      }
      if (nearest !== undefined) drawCard(context, nearest, nearestAt.x, nearestAt.y);
      context.font = CARD_FONT;
      context.textAlign = "left";
      context.fillStyle = "#ffffff";
      context.fillText(
        `${gestureLabel(spinOf(gesture), isScribbling(gesture))}   ·   C collision shapes   ·   A hides this`,
        HEADER_X,
        HEADER_Y,
      );
    },
    dispose() {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onPointer);
      canvas.remove();
    },
  };
}
