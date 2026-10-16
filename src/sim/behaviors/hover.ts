import { clamp } from "../../core/math";
import type { SwimParams } from "../../scene/swimming";
import { CRUISE_RESPONSE, drawDuration, drawSide, jitterYaw, yawTowards } from "./shared";
import type { SwimContext, SwimState, SwimStyle } from "./types";

/** Pectoral fins do most of the work; the tail only helps. */
const HOVER_THRUST = 0.6;
/** Small corrections between turns, radians per square root of a second. */
const HOVER_JITTER = 0.15;
/** Smallest turn on the spot, radians. */
const SMALLEST_TURN = 0.4;
/** Each turn sets off at a speed between these shares of the style's speed. */
const SPEED_SPREAD: readonly [number, number] = [0.7, 1.3];
/** The height drifts around the spot by this many roaming distances. */
const HEIGHT_WANDER = 0.5;
/** A fish keeps station this many body lengths above the top of its host. */
const ABOVE_HOST_BODY_LENGTHS = 1;
/**
 * A fish heads home at cruise speed once this many roaming distances away,
 * across or in height: drifting at hovering speed it could hardly climb or sink.
 */
const COMMUTE_ROAMS = 2;
const HOVERING = 0;
const COMMUTING = 1;

type Params = SwimParams<"hover">;

/** Settles over the nearest place tagged `home`, or where the fish is. */
function settle(state: SwimState, params: Params, context: SwimContext): void {
  state.anchored =
    params.home !== undefined && context.places.nearest(params.home, context.position, state.home);
  if (state.anchored) state.home.y += ABOVE_HOST_BODY_LENGTHS * context.length;
  else state.home.copy(context.position);
  state.height = state.home.y;
}

/** A new height near home: above a host, or around the spot within the room. */
function driftAroundHome(state: SwimState, context: SwimContext, roam: number): void {
  const { room, rng } = context;
  const low = state.anchored ? state.home.y : room.min.y;
  const high = state.anchored ? state.home.y + roam : room.max.y;
  state.height = clamp(state.home.y + rng.normal(0, roam * HEIGHT_WANDER), low, high);
}

/**
 * Keeps station: drifts slowly, turns on the spot, comes back when it strays.
 * With a `home` tag it keeps station over a place, like a clownfish over its
 * anemone.
 */
export const hoverStyle: SwimStyle<"hover"> = {
  id: "hover",
  start(state, params, context) {
    settle(state, params, context);
    state.phase = HOVERING;
    state.speed = params.speed;
    state.response = CRUISE_RESPONSE;
    state.thrust = HOVER_THRUST;
    state.timer = context.rng.range(params.turnSeconds[0], params.turnSeconds[1]);
    state.heightTimer = drawDuration(context, params.heightChangeSeconds);
  },
  step(state, params, context, deltaSeconds) {
    const { position, rng } = context;
    const roam = params.roamBodyLengths * context.length;
    const away = Math.hypot(position.x - state.home.x, position.z - state.home.z);
    const offHeight = Math.abs(position.y - state.home.y);
    if (away > roam * COMMUTE_ROAMS || offHeight > roam * COMMUTE_ROAMS) {
      // Far from home (swept away, or just arrived): swim back briskly,
      // circling down or up once above or below it.
      if (away > roam) state.yaw = yawTowards(context, state.home.x, state.home.z);
      state.speed = 1;
      state.thrust = 1;
      state.height = state.home.y;
      state.phase = COMMUTING;
      return;
    }
    if (state.phase === COMMUTING) {
      // Back near home: slow down and turn at once rather than overshoot.
      state.phase = HOVERING;
      state.thrust = HOVER_THRUST;
      state.timer = 0;
    }
    state.timer -= deltaSeconds;
    const homeward = yawTowards(context, state.home.x, state.home.z);
    // Out of its spot and still drifting away: turn back now.
    const leaving = away > roam && Math.cos(state.yaw - homeward) < 0;
    if (state.timer <= 0 || leaving) {
      state.timer = rng.range(params.turnSeconds[0], params.turnSeconds[1]);
      state.speed = params.speed * rng.range(SPEED_SPREAD[0], SPEED_SPREAD[1]);
      state.yaw =
        away > roam
          ? homeward
          : state.yaw + drawSide(context) * rng.range(SMALLEST_TURN, params.turnAngle);
    }
    jitterYaw(state, context, HOVER_JITTER, deltaSeconds);
    state.heightTimer -= deltaSeconds;
    if (state.heightTimer <= 0) {
      state.heightTimer = drawDuration(context, params.heightChangeSeconds);
      driftAroundHome(state, context, roam);
    }
  },
};
