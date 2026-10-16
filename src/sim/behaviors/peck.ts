import { CRUISE_RESPONSE, settleDown, yawTowards } from "./shared";
import type { Activity } from "./types";

const APPROACH = 0;
const BACK_OFF = 1;
const DART = 2;
/** A fish that has not got there after this long gives up, s. */
const APPROACH_SECONDS = 20;
/** It starts pecking within this many body lengths of the place, across and in height. */
const ARRIVAL_BODY_LENGTHS = 1.2;
/** Between pecks it waits this many body lengths above the place. */
const ABOVE_BODY_LENGTHS = 0.8;
/** A dart brings the body this close to the top, in body lengths: the mouth reaches it. */
const DART_BODY_LENGTHS = 0.1;
const DART_SECONDS = 0.3;
const DART_SPEED = 0.7;
/** A dart reaches its speed at once, 1/s. */
const DART_RESPONSE = 6;
/** Pause between pecks, s. */
const PAUSE_SECONDS: readonly [number, number] = [0.5, 1.2];
const PAUSE_SPEED = 0.12;
const PAUSE_THRUST = 0.5;

/** Swims down to a place and picks at it: short darts with the mouth open. */
export const peckActivity: Activity<"peck"> = {
  id: "peck",
  atPlace: true,
  needsPlace: true,
  restful: false,
  start(state, params, context) {
    state.phase = APPROACH;
    state.timer = APPROACH_SECONDS;
    state.count = context.rng.int(params.pecks[0], params.pecks[1]);
  },
  step(state, wishes, _params, context, deltaSeconds) {
    const { target } = state;
    const { position, length, rng } = context;
    const above = target.y + length * ABOVE_BODY_LENGTHS;
    wishes.yaw = yawTowards(context, target.x, target.z);
    state.timer -= deltaSeconds;
    if (state.phase === APPROACH) {
      // Fish dive steeply to what they mean to pick at.
      wishes.steep = true;
      wishes.height = above;
      wishes.speed = 1;
      wishes.thrust = 1;
      wishes.response = CRUISE_RESPONSE;
      const across = Math.hypot(target.x - position.x, target.z - position.z);
      const arrival = length * ARRIVAL_BODY_LENGTHS;
      if (across < arrival && Math.abs(position.y - above) < arrival) {
        state.phase = BACK_OFF;
        state.timer = 0;
      } else if (state.timer <= 0) {
        settleDown(wishes);
        return false;
      } else {
        return true;
      }
    }
    if (state.timer <= 0) {
      if (state.phase === DART) {
        state.count -= 1;
        if (state.count <= 0) {
          settleDown(wishes);
          return false;
        }
        state.phase = BACK_OFF;
        state.timer = rng.range(PAUSE_SECONDS[0], PAUSE_SECONDS[1]);
      } else {
        state.phase = DART;
        state.timer = DART_SECONDS;
      }
    }
    wishes.steep = true;
    if (state.phase === DART) {
      wishes.height = target.y + length * DART_BODY_LENGTHS;
      wishes.speed = DART_SPEED;
      wishes.response = DART_RESPONSE;
      wishes.thrust = 1;
      wishes.mouth = 1;
    } else {
      wishes.height = above;
      wishes.speed = PAUSE_SPEED;
      wishes.response = CRUISE_RESPONSE;
      wishes.thrust = PAUSE_THRUST;
      wishes.mouth = 0;
    }
    return true;
  },
};
