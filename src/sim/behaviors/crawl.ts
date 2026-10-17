import type { SwimParams } from "../../scene/swimming";
import { CRUISE_RESPONSE, jitterYaw } from "./shared";
import type { SwimContext, SwimState, SwimStyle } from "./types";

const WALK = 0;
const STOP = 1;
/** Legs carry the body; the tail (or abdomen) all but rests. */
const WALK_THRUST = 0.15;
const STOP_THRUST = 0.05;
/** A walker stops and starts within a fraction of a second, 1/s. */
const STOP_RESPONSE = CRUISE_RESPONSE * 2;

type Params = SwimParams<"crawl">;

function walk(state: SwimState, params: Params, context: SwimContext): void {
  const { rng } = context;
  state.phase = WALK;
  state.timer = rng.range(params.walkSeconds[0], params.walkSeconds[1]);
  state.yaw += rng.normal(0, params.turnAngle);
  state.speed = params.speed;
  state.response = CRUISE_RESPONSE;
  state.thrust = WALK_THRUST;
}

function stop(state: SwimState, params: Params, context: SwimContext): void {
  state.phase = STOP;
  state.timer = context.rng.range(params.stopSeconds[0], params.stopSeconds[1]);
  state.speed = 0;
  state.response = STOP_RESPONSE;
  state.thrust = STOP_THRUST;
}

/** Walks along the floor, stops to pick at the ground, walks off another way. */
export const crawlStyle: SwimStyle<"crawl"> = {
  id: "crawl",
  start(state, params, context) {
    state.grounded = true;
    state.sideways = params.sideways;
    state.landbound = !params.swims;
    state.withdraws = params.fright === "shell";
    // Every walker starts somewhere in a stop, so a group does not set off in step.
    stop(state, params, context);
    state.timer *= context.rng.next();
  },
  step(state, params, context, deltaSeconds) {
    state.timer -= deltaSeconds;
    if (state.timer <= 0) {
      if (state.phase === STOP) walk(state, params, context);
      else stop(state, params, context);
    }
    if (state.phase === WALK) jitterYaw(state, context, params.turnJitter, deltaSeconds);
  },
};
