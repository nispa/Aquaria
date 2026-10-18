import { CRUISE_RESPONSE, driftHeight, jitterYaw, startHeight } from "./shared";
import type { SwimContext, SwimState, SwimStyle } from "./types";
import type { SwimParams } from "../../scene/swimming";

const BURST = 0;
const COAST = 1;
/** A burst reaches its speed within a fraction of a second, 1/s. */
const BURST_RESPONSE = 6;
/** Coasting fish lose speed to drag, more slowly than they swim, 1/s. */
const DRAG_RESPONSE = CRUISE_RESPONSE / 2;
/** The tail is all but still while coasting. */
const COAST_THRUST = 0.1;
/** Small drift of the heading while coasting, radians per square root of a second. */
const COAST_JITTER = 0.2;

type Params = SwimParams<"burst-coast">;

function coast(state: SwimState, params: Params, context: SwimContext): void {
  state.phase = COAST;
  state.timer = context.rng.range(params.coastSeconds[0], params.coastSeconds[1]);
  state.speed = params.coastSpeed;
  state.response = DRAG_RESPONSE;
  state.thrust = Math.min(COAST_THRUST, params.thrust);
}

function burst(state: SwimState, params: Params, context: SwimContext): void {
  state.phase = BURST;
  state.timer = params.burstSeconds;
  state.yaw += context.rng.normal(0, params.burstTurn);
  state.speed = params.burstSpeed;
  state.response = BURST_RESPONSE;
  state.thrust = params.thrust;
}

/** Dart off in a new direction, glide with a still tail, slow down, dart again. */
export const burstCoastStyle: SwimStyle<"burst-coast"> = {
  id: "burst-coast",
  start(state, params, context) {
    // Every fish starts somewhere in a coast, so a group does not dart in step.
    coast(state, params, context);
    startHeight(state, context, params.heightChangeSeconds);
  },
  step(state, params, context, deltaSeconds) {
    state.timer -= deltaSeconds;
    if (state.timer <= 0) {
      if (state.phase === COAST) burst(state, params, context);
      else coast(state, params, context);
    }
    if (state.phase === COAST) jitterYaw(state, context, COAST_JITTER, deltaSeconds);
    driftHeight(state, context, params.heightChangeSeconds, deltaSeconds);
  },
};
