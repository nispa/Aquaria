import type { Activity } from "./types";

/** Swims about in the species' own style for a while: the style leads. */
export const wanderActivity: Activity<"wander"> = {
  id: "wander",
  atPlace: false,
  start(state, params, context) {
    state.timer = context.rng.range(params.seconds[0], params.seconds[1]);
  },
  step(state, _wishes, _params, _context, deltaSeconds) {
    state.timer -= deltaSeconds;
    return state.timer > 0;
  },
};
