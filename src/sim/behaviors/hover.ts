import { clamp } from "../../core/math";
import { CRUISE_RESPONSE, drawDuration, drawSide, jitterYaw, yawTowards } from "./shared";
import type { SwimStyle } from "./types";

/** Pectoral fins do most of the work; the tail only helps. */
const HOVER_THRUST = 0.4;
/** Small corrections between turns, radians per square root of a second. */
const HOVER_JITTER = 0.15;
/** Smallest turn on the spot, radians. */
const SMALLEST_TURN = 0.4;
/** Each turn sets off at a speed between these shares of the style's speed. */
const SPEED_SPREAD: readonly [number, number] = [0.7, 1.3];
/** The height drifts around the spot by this many roaming distances. */
const HEIGHT_WANDER = 0.5;

/** Keeps station: drifts slowly, turns on the spot, comes back when it strays. */
export const hoverStyle: SwimStyle<"hover"> = {
  id: "hover",
  start(state, params, context) {
    state.home.copy(context.position);
    state.speed = params.speed;
    state.response = CRUISE_RESPONSE;
    state.thrust = HOVER_THRUST;
    state.timer = context.rng.range(params.turnSeconds[0], params.turnSeconds[1]);
    state.height = context.position.y;
    state.heightTimer = drawDuration(context, params.heightChangeSeconds);
  },
  step(state, params, context, deltaSeconds) {
    const { position, room, rng } = context;
    const roam = params.roamBodyLengths * context.length;
    state.timer -= deltaSeconds;
    if (state.timer <= 0) {
      state.timer = rng.range(params.turnSeconds[0], params.turnSeconds[1]);
      state.speed = params.speed * rng.range(SPEED_SPREAD[0], SPEED_SPREAD[1]);
      const strayed = Math.hypot(position.x - state.home.x, position.z - state.home.z) > roam;
      state.yaw = strayed
        ? yawTowards(context, state.home.x, state.home.z)
        : state.yaw + drawSide(context) * rng.range(SMALLEST_TURN, params.turnAngle);
    }
    jitterYaw(state, context, HOVER_JITTER, deltaSeconds);
    state.heightTimer -= deltaSeconds;
    if (state.heightTimer <= 0) {
      state.heightTimer = drawDuration(context, params.heightChangeSeconds);
      state.height = clamp(
        state.home.y + rng.normal(0, roam * HEIGHT_WANDER),
        room.min.y,
        room.max.y,
      );
    }
  },
};
