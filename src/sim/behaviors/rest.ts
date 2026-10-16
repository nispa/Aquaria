import { CRUISE_RESPONSE, yawTowards } from "./shared";
import type { Activity } from "./types";

const APPROACH = 0;
const SETTLED = 1;
/** Swimming to its shelter, as a share of cruise speed. */
const APPROACH_SPEED = 0.6;
/** Resting: barely moving, fins doing the work. */
const REST_SPEED = 0.08;
const REST_THRUST = 0.3;
/** It rests this many body lengths beside the shelter's side. */
const BESIDE_BODY_LENGTHS = 1.5;
/** Settles within this many resting distances, and heads back beyond twice that. */
const SETTLE_REACH = 1.3;
const DRIFT_REACH = 2;
/** Slow drift of the resting heading, radians per square root of a second. */
const HEADING_DRIFT = 0.1;

/**
 * Rests: swims to a shelter and settles beside it, halfway up, or without
 * one sinks to the bottom of its room, and barely moves for a while.
 */
export const restActivity: Activity<"rest"> = {
  id: "rest",
  atPlace: true,
  needsPlace: false,
  restful: true,
  start(state, params, context) {
    state.timer = context.rng.range(params.seconds[0], params.seconds[1]);
    state.phase = state.targetSize >= 0 ? APPROACH : SETTLED;
    state.heading = Number.NaN;
  },
  step(state, wishes, _params, context, deltaSeconds) {
    const { target, targetSize } = state;
    const { position, length, room, rng } = context;
    state.timer -= deltaSeconds;
    wishes.response = CRUISE_RESPONSE;
    if (Number.isNaN(state.heading)) state.heading = wishes.yaw;
    let homeward = false;
    if (targetSize >= 0) {
      const beside = targetSize / 2 + length * BESIDE_BODY_LENGTHS;
      const distance = Math.hypot(target.x - position.x, target.z - position.z);
      wishes.height = target.y - targetSize / 2;
      if (state.phase === APPROACH && distance < beside * SETTLE_REACH) state.phase = SETTLED;
      homeward = state.phase === APPROACH || distance > beside * DRIFT_REACH;
    } else {
      wishes.height = room.min.y;
    }
    if (homeward) {
      state.heading = yawTowards(context, target.x, target.z);
      wishes.speed = APPROACH_SPEED;
      wishes.thrust = 1;
    } else {
      state.heading += rng.normal(0, HEADING_DRIFT * Math.sqrt(deltaSeconds));
      wishes.speed = REST_SPEED;
      wishes.thrust = REST_THRUST;
    }
    wishes.yaw = state.heading;
    return state.timer > 0;
  },
};
