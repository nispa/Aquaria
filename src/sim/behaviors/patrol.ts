import { clamp } from "../../core/math";
import { CRUISE_RESPONSE, drawSide } from "./shared";
import type { SwimParams } from "../../scene/swimming";
import type { SwimContext, SwimStyle } from "./types";

/** How hard a fish off its lap steers back onto it, relative to following it. */
const RADIAL_GAIN = 1;
/** Below this distance from home, m, the lap has no direction: keep the heading. */
const AT_HOME = 1e-6;

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
    const { position, rng } = context;
    state.timer -= deltaSeconds;
    if (state.timer <= 0) {
      state.turn = -state.turn;
      state.timer = rng.range(params.reverseSeconds[0], params.reverseSeconds[1]);
    }
    const awayX = position.x - state.home.x;
    const awayZ = position.z - state.home.z;
    const distance = Math.hypot(awayX, awayZ);
    if (distance < AT_HOME) return;
    const radius = lapRadius(params, context);
    // Along the circle (the tangent), plus back onto it (the radial term).
    const inward = (RADIAL_GAIN * (radius - distance)) / radius / distance;
    const x = (-state.turn * awayZ) / distance + inward * awayX;
    const z = (state.turn * awayX) / distance + inward * awayZ;
    state.yaw = Math.atan2(z, x);
  },
};
