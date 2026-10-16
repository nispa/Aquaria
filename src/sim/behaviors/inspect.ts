import { CRUISE_RESPONSE, drawSide, lapYaw, settleDown, yawTowards } from "./shared";
import type { Activity } from "./types";

const APPROACH = 0;
const CIRCLE = 1;
const FACE = 2;
/** A fish that has not got there after this long gives up, s. */
const APPROACH_SECONDS = 20;
/** It starts looking within this many look distances of the place. */
const ARRIVAL = 1.3;
/** Speeds while looking, as shares of cruise speed. */
const CIRCLE_SPEED = 0.5;
const FACE_SPEED = 0.15;
/** A hovering fish that has drifted this close starts circling instead. */
const TOO_CLOSE = 0.6;
/** Fish look at the upper part of a place: this far down from its top, in place heights. */
const LOOK_DEPTH = 0.3;
const LOOK_THRUST = 0.6;

/** Swims up to a place, circles it or hovers facing it, then swims off. */
export const inspectActivity: Activity<"inspect"> = {
  id: "inspect",
  atPlace: true,
  start(state, _params, context) {
    state.phase = APPROACH;
    state.timer = APPROACH_SECONDS;
    state.turn = drawSide(context);
  },
  step(state, wishes, params, context, deltaSeconds) {
    const { target } = state;
    const { position, rng } = context;
    const look = state.targetSize / 2 + params.distanceBodyLengths * context.length;
    const distance = Math.hypot(target.x - position.x, target.z - position.z);
    wishes.height = target.y - state.targetSize * LOOK_DEPTH;
    wishes.response = CRUISE_RESPONSE;
    state.timer -= deltaSeconds;
    if (state.phase === APPROACH) {
      if (distance < look * ARRIVAL) {
        state.phase = rng.next() < 0.5 ? CIRCLE : FACE;
        state.timer = rng.range(params.seconds[0], params.seconds[1]);
      } else {
        wishes.yaw = yawTowards(context, target.x, target.z);
        wishes.speed = 1;
        wishes.thrust = 1;
        // Fish dive steeply to what caught their eye, and level out to look.
        wishes.steep = true;
        if (state.timer > 0) return true;
        settleDown(wishes);
        return false;
      }
    }
    if (state.phase === FACE && distance < look * TOO_CLOSE) state.phase = CIRCLE;
    if (state.phase === CIRCLE) {
      wishes.yaw = lapYaw(context, target.x, target.z, look, state.turn, wishes.yaw);
      wishes.speed = CIRCLE_SPEED;
    } else {
      wishes.yaw = yawTowards(context, target.x, target.z);
      wishes.speed = FACE_SPEED;
    }
    wishes.thrust = LOOK_THRUST;
    wishes.steep = false;
    return state.timer > 0;
  },
};
