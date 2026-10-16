import { Vector3 } from "three";
import type { ActivityId } from "../scene/activities";
import type { ActivityState } from "../sim/behaviors";
import type { Fish } from "../sim/simulation";

/**
 * Development overlay: the activity of every fish written over it, with a
 * line to the place it is about. Only created in dev builds; toggled with A.
 */

const COLORS: Readonly<Record<ActivityId, string>> = {
  wander: "rgba(255, 255, 255, 0.55)",
  inspect: "#5ad1ff",
  peck: "#ffb347",
};
const FONT = "12px system-ui, sans-serif";
/** Labels sit this far above the fish, CSS pixels. */
const LABEL_OFFSET = 10;

export function activityColor(id: ActivityId): string {
  return COLORS[id];
}

/** Short text for an activity: the time left for wandering, pecks left for pecking. */
export function activityLabel(activity: ActivityState): string {
  if (activity.id === "wander") return `wander ${Math.round(activity.timer)}s`;
  if (activity.id === "peck") return `peck ×${activity.count}`;
  return activity.id;
}

/** Where a point in the tank shows on screen, as normalized device coordinates in `out`; false when off screen. */
export type ScreenProjection = (point: Vector3, out: Vector3) => boolean;

export interface ActivityOverlay {
  /** Redraws the labels, when shown. */
  draw(fish: readonly Fish[], project: ScreenProjection): void;
  dispose(): void;
}

export function createActivityOverlay(parent: HTMLElement): ActivityOverlay {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:5;display:none";
  parent.append(canvas);
  const context = canvas.getContext("2d");
  let shown = false;
  const at = new Vector3();
  const to = new Vector3();

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== "a" && event.key !== "A") return;
    shown = !shown;
    canvas.style.display = shown ? "block" : "none";
  };
  window.addEventListener("keydown", onKey);

  const toPixels = (point: Vector3, width: number, height: number): void => {
    point.set(((point.x + 1) / 2) * width, ((1 - point.y) / 2) * height, 0);
  };

  return {
    draw(fish, project) {
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
      for (const member of fish) {
        if (member.state !== "swimming" || !project(member.position, at)) continue;
        toPixels(at, width, height);
        const { activity } = member;
        context.fillStyle = context.strokeStyle = activityColor(activity.id);
        context.fillText(activityLabel(activity), at.x, at.y - LABEL_OFFSET);
        if (activity.id === "wander" || !project(activity.target, to)) continue;
        toPixels(to, width, height);
        context.beginPath();
        context.moveTo(at.x, at.y);
        context.lineTo(to.x, to.y);
        context.stroke();
      }
    },
    dispose() {
      window.removeEventListener("keydown", onKey);
      canvas.remove();
    },
  };
}
