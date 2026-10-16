import { clamp } from "../../core/math";
import { CRUISE_RESPONSE, settleDown, yawTowards } from "./shared";
import type { Activity, SwimContext } from "./types";

const APPROACH = 0;
const BACK_OFF = 1;
const DART = 2;
/** A fish that has not got there after this long gives up, s. */
const APPROACH_SECONDS = 20;
/** It starts pecking within this many body lengths of the place, across and in height. */
const ARRIVAL_BODY_LENGTHS = 1.5;
/**
 * On the way it comes down a slope onto the place, this many meters down per
 * meter across, rather than diving first and threading through the scenery.
 */
const GLIDE_SLOPE = 0.6;
/** Between pecks it waits this many body lengths above the place. */
const ABOVE_BODY_LENGTHS = 0.5;
/**
 * A fish cannot dive straight down: a dart slopes down at about 40°. So
 * between pecks it lines up LINE_UP_BODY_LENGTHS short of the place (seen
 * from above), taking LINE_UP_SECONDS to get there, and darts once within
 * LINED_UP_BODY_LENGTHS of that spot, across and in height. A fish that
 * finds itself over the place, closer than TOO_CLOSE of that, swims out.
 */
const LINE_UP_BODY_LENGTHS = 0.65;
const LINE_UP_SECONDS = 0.8;
const LINED_UP_BODY_LENGTHS = 0.3;
const TOO_CLOSE = 0.5;
/** It darts only when heading for the place within this angle, radians. */
const FACING = 0.5;
/**
 * The dart ends with the body's centre this far short of the place across,
 * and DART_BODY_LENGTHS above it, in body lengths: the mouth, half a body
 * ahead and pointing down the slope, is then on the place.
 */
const DART_END_BODY_LENGTHS = 0.38;
/** A fish that cannot line up within this long, s, pecks no more. */
const LINE_UP_GIVE_UP_SECONDS = 8;
const DART_BODY_LENGTHS = 0.32;
const DART_SECONDS = 0.4;
/** A dart's speed range, as a share of cruise speed. */
const DART_SPEED: readonly [number, number] = [0.15, 0.8];
/** A dart reaches its speed at once, 1/s. */
const DART_RESPONSE = 6;
/** Pause between pecks, s. */
const PAUSE_SECONDS: readonly [number, number] = [0.5, 1.2];
/** Speed range while lining up, as a share of cruise speed. */
const LINE_UP_SPEED: readonly [number, number] = [0.1, 0.6];
const PAUSE_THRUST = 0.5;

/** The share of cruise speed that covers `distance` m in `seconds`, kept within `range`. */
function arrivalSpeed(
  context: SwimContext,
  distance: number,
  seconds: number,
  range: readonly [number, number],
): number {
  return clamp(distance / seconds / context.cruise, range[0], range[1]);
}

/**
 * Swims down to a place and picks at it: it lines up with its mouth just
 * short of the place, then darts in with the mouth open, backs off and
 * lines up again.
 */
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
    const across = Math.hypot(target.x - position.x, target.z - position.z);
    const lineUp = length * LINE_UP_BODY_LENGTHS;
    const towards = yawTowards(context, target.x, target.z);
    wishes.yaw = towards;
    wishes.steep = true;
    state.timer -= deltaSeconds;
    if (state.phase === APPROACH) {
      // Fish come down steeply onto what they mean to pick at.
      const arrival = length * ARRIVAL_BODY_LENGTHS;
      wishes.height = above + Math.max(across - arrival, 0) * GLIDE_SLOPE;
      wishes.speed = 1;
      wishes.thrust = 1;
      wishes.response = CRUISE_RESPONSE;
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
    if (state.phase === DART && state.timer <= 0) {
      state.count -= 1;
      if (state.count <= 0) {
        settleDown(wishes);
        return false;
      }
      state.phase = BACK_OFF;
      state.timer = rng.range(PAUSE_SECONDS[0], PAUSE_SECONDS[1]);
    }
    if (state.phase === BACK_OFF && state.timer <= 0) {
      const linedUp = length * LINED_UP_BODY_LENGTHS;
      const { velocity } = context;
      const heading = Math.atan2(velocity.z, velocity.x);
      const facing = Math.abs(Math.atan2(Math.sin(heading - towards), Math.cos(heading - towards)));
      if (
        Math.abs(across - lineUp) < linedUp &&
        Math.abs(position.y - above) < linedUp &&
        facing < FACING
      ) {
        state.phase = DART;
        state.timer = DART_SECONDS;
      } else if (state.timer < -LINE_UP_GIVE_UP_SECONDS) {
        settleDown(wishes);
        return false;
      }
    }
    if (state.phase === DART) {
      const end = target.y + length * DART_BODY_LENGTHS;
      const left = Math.hypot(across - length * DART_END_BODY_LENGTHS, position.y - end);
      wishes.height = end;
      wishes.speed = arrivalSpeed(context, left, DART_SECONDS, DART_SPEED);
      wishes.response = DART_RESPONSE;
      wishes.thrust = 1;
      wishes.mouth = 1;
    } else {
      wishes.height = above;
      // Right over the place: swim out to come back at it down a slope.
      if (across < lineUp * TOO_CLOSE) wishes.yaw = towards + Math.PI;
      wishes.speed = arrivalSpeed(
        context,
        Math.abs(across - lineUp),
        LINE_UP_SECONDS,
        LINE_UP_SPEED,
      );
      wishes.response = CRUISE_RESPONSE;
      wishes.thrust = PAUSE_THRUST;
      wishes.mouth = 0;
    }
    return true;
  },
};
