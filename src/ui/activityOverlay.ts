import { Vector3 } from "three";
import type { ActivityId } from "../scene/activities";
import type { ActivityState } from "../sim/behaviors";
import { isScribbling, spinOf, type Gesture } from "../sim/gesture";
import type { Fish } from "../sim/simulation";

/**
 * What every fish is doing, written over it: its activity, or the spell the
 * viewer has cast on it. The fish nearest the pointer gets a card with its
 * details, and a line at the top says what the finger is drawing. Toggled
 * with A.
 */

const COLORS: Readonly<Record<ActivityId, string>> = {
  wander: "rgba(255, 255, 255, 0.55)",
  inspect: "#5ad1ff",
  peck: "#ffb347",
};
const SPELL_COLORS = { hypnotized: "#d58cff", dizzy: "#7dff9b", tickled: "#ff6fb5" } as const;
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
const CENTIMETERS = 100;

export function activityColor(id: ActivityId): string {
  return COLORS[id];
}

/** Short text for an activity: the time left for wandering, pecks left for pecking. */
export function activityLabel(activity: ActivityState): string {
  if (activity.id === "wander") return `wander ${Math.round(activity.timer)}s`;
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

/** The one-line label over a fish: its spell, or else its activity. */
export function fishLabel(fish: Fish): string {
  const spell = spellOf(fish);
  return spell === undefined ? activityLabel(fish.activity) : spellLabel(fish, spell);
}

function labelColor(fish: Fish): string {
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
export type ScreenProjection = (point: Vector3, out: Vector3) => boolean;

export interface ActivityOverlay {
  /** Redraws the labels, when shown. */
  draw(fish: readonly Fish[], gesture: Readonly<Gesture>, project: ScreenProjection): void;
  dispose(): void;
}

export function createActivityOverlay(parent: HTMLElement): ActivityOverlay {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:5;display:none";
  parent.append(canvas);
  const context = canvas.getContext("2d");
  let shown = false;
  let pointerX = Number.NaN;
  let pointerY = Number.NaN;
  const at = new Vector3();
  const to = new Vector3();
  const nearestAt = new Vector3();

  const onKey = (event: KeyboardEvent): void => {
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
    draw(fish, gesture, project) {
      if (!shown || context === null) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.clearRect(0, 0, width, height);
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
        `${gestureLabel(spinOf(gesture), isScribbling(gesture))}   ·   A hides this`,
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
