import { clamp } from "../../core/math";
import { CRUISE_RESPONSE, drawSide } from "./shared";
import type { SwimStyle } from "./types";

/** Long fins and a lazy tail. */
const GLIDE_THRUST = 0.3;
/**
 * The turn rate follows a sine pushed into a rounded square wave: steady
 * through each loop, easing into the change of way between loops.
 */
const LOOP_SQUARENESS = 3;
/** Stretches each loop so the eased ends still leave a full circle. */
const LOOP_STRETCH = 1.15;
const FULL_TURN = Math.PI * 2;

/** Slow figure eights while rising and sinking through the habitat. */
export const glideStyle: SwimStyle<"glide"> = {
  id: "glide",
  start(state, params, context) {
    state.speed = params.speed;
    state.response = CRUISE_RESPONSE;
    state.thrust = GLIDE_THRUST;
    state.turn = drawSide(context);
    // A random point in the cycle, so gliders do not move in step.
    state.clock = context.rng.range(0, params.heightPeriodSeconds);
  },
  step(state, params, context, deltaSeconds) {
    const { room } = context;
    state.clock += deltaSeconds;
    const loopSeconds = (FULL_TURN / params.turnRate) * LOOP_STRETCH;
    const way = clamp(LOOP_SQUARENESS * Math.sin((Math.PI * state.clock) / loopSeconds), -1, 1);
    state.yaw += state.turn * params.turnRate * way * deltaSeconds;
    const middle = (room.min.y + room.max.y) / 2;
    const reach = ((room.max.y - room.min.y) / 2) * params.heightSwing;
    state.height =
      middle + reach * Math.sin((FULL_TURN * state.clock) / params.heightPeriodSeconds);
  },
};
