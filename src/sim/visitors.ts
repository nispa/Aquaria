import { Vector3 } from "three";
import type { Rng } from "../core/rng";
import type { Visitor } from "../scene/schema";
import type { TankSize } from "./tank";

/**
 * Visitors: animals that swim past far behind the tank now and then (the
 * scene's `visitors`, such as sea turtles). Each waits a while out of sight,
 * then crosses from one side to the other at its own distance and height,
 * rising and sinking a little, and goes away again. They take no notice of
 * the fish, and nothing in the tank takes notice of them.
 */

/** Beyond the tank's sides a pass starts and ends this far out, per metre of distance behind it: out of the view. */
const SIDE_MARGIN_PER_METRE = 0.8;
/** The gentle rise and fall along a pass: how high, m, and how fast, radians a second. */
const BOB_HEIGHT = 0.12;
const BOB_RATE = 0.5;
const FULL_TURN = Math.PI * 2;

export interface VisitorState {
  /** The animal's model folder (public/assets/animals). */
  readonly model: string;
  /** Body length, m. */
  readonly length: number;
  /** Where it is, m; meaningful while visible. */
  readonly position: Vector3;
  /** Where it is going, m/s. */
  readonly velocity: Vector3;
  /** Whether it is passing now. */
  readonly visible: boolean;
}

export interface Visitors {
  readonly all: readonly VisitorState[];
  /** Moves the visitors on by `seconds`. Allocation-free. */
  step(seconds: number): void;
}

interface Traveller extends VisitorState {
  visible: boolean;
  /** Seconds until the next pass, while out of sight. */
  wait: number;
  /** +1 left to right, -1 right to left. */
  direction: number;
  /** Where a pass starts and ends, |x|, m. */
  span: number;
  baseHeight: number;
  bobPhase: number;
}

/** Visitors of the scene in a tank, each on its own schedule from the generator. */
export function createVisitors(specs: readonly Visitor[], tank: TankSize, rng: Rng): Visitors {
  const travellers: { spec: Visitor; state: Traveller }[] = [];
  for (const spec of specs) {
    for (let index = 0; index < spec.count; index += 1) {
      travellers.push({
        spec,
        state: {
          model: spec.model,
          length: spec.length,
          position: new Vector3(),
          velocity: new Vector3(),
          visible: false,
          wait: rng.range(spec.every[0], spec.every[1]),
          direction: 1,
          span: 0,
          baseHeight: 0,
          bobPhase: 0,
        },
      });
    }
  }

  const startPass = (spec: Visitor, state: Traveller): void => {
    const distance = rng.range(spec.distance[0], spec.distance[1]);
    state.direction = rng.next() < 0.5 ? -1 : 1;
    state.span = tank.width / 2 + distance * SIDE_MARGIN_PER_METRE + spec.length;
    state.baseHeight = rng.range(spec.height[0], spec.height[1]) * tank.height;
    state.bobPhase = rng.range(0, FULL_TURN);
    state.position.set(-state.direction * state.span, state.baseHeight, -(tank.depth + distance));
    state.visible = true;
  };

  return {
    all: travellers.map(({ state }) => state),
    step(seconds) {
      for (const { spec, state } of travellers) {
        if (!state.visible) {
          state.wait -= seconds;
          if (state.wait <= 0) startPass(spec, state);
          continue;
        }
        state.bobPhase += BOB_RATE * seconds;
        const height = state.baseHeight + BOB_HEIGHT * Math.sin(state.bobPhase);
        state.velocity.set(
          state.direction * spec.speed,
          seconds > 0 ? (height - state.position.y) / seconds : 0,
          0,
        );
        state.position.x += state.direction * spec.speed * seconds;
        state.position.y = height;
        if (state.direction * state.position.x > state.span) {
          state.visible = false;
          state.wait = rng.range(spec.every[0], spec.every[1]);
        }
      }
    },
  };
}
