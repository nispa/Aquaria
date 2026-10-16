import { clamp } from "../../core/math";
import { CRUISE_RESPONSE, drawSide, lapYaw } from "./shared";
import type { SwimParams } from "../../scene/swimming";
import type { SwimContext, SwimStyle } from "./types";

/** The lap's radius, m: shrunk to fit habitats narrower than the lap. */
export function lapRadius(params: SwimParams<"patrol">, context: SwimContext): number {
  const { room } = context;
  return Math.min(
    params.radiusBodyLengths * context.length,
    (room.max.x - room.min.x) / 2,
    (room.max.z - room.min.z) / 2,
  );
}

/** Laps around a home spot, now one way round, now the other. */
export const patrolStyle: SwimStyle<"patrol"> = {
  id: "patrol",
  start(state, params, context) {
    const { position, room, rng } = context;
    const radius = lapRadius(params, context);
    state.home.set(
      clamp(position.x, room.min.x + radius, room.max.x - radius),
      clamp(position.y, room.min.y, room.max.y),
      clamp(position.z, room.min.z + radius, room.max.z - radius),
    );
    state.height = state.home.y;
    state.speed = params.speed;
    state.response = CRUISE_RESPONSE;
    state.thrust = 1;
    state.turn = drawSide(context);
    state.timer = rng.range(params.reverseSeconds[0], params.reverseSeconds[1]);
  },
  step(state, params, context, deltaSeconds) {
    const { rng } = context;
    state.timer -= deltaSeconds;
    if (state.timer <= 0) {
      state.turn = -state.turn;
      state.timer = rng.range(params.reverseSeconds[0], params.reverseSeconds[1]);
    }
    const { home } = state;
    state.yaw = lapYaw(context, home.x, home.z, lapRadius(params, context), state.turn, state.yaw);
  },
};
