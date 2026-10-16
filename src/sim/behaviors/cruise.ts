import { clamp } from "../../core/math";
import { CRUISE_RESPONSE, driftHeight, jitterYaw, startHeight } from "./shared";
import type { SwimStyle } from "./types";

/** How long the speed takes to drift back towards cruise speed, s. */
const SPEED_SETTLE_SECONDS = 4;
/** The wanted speed stays within these shares of cruise speed. */
const SLOWEST = 0.55;
const FASTEST = 1.45;

/** Long, smooth laps; the speed wanders gently around cruise speed. */
export const cruiseStyle: SwimStyle<"cruise"> = {
  id: "cruise",
  start(state, params, context) {
    state.speed = 1;
    state.response = CRUISE_RESPONSE;
    state.thrust = 1;
    startHeight(state, context, params.heightChangeSeconds);
  },
  step(state, params, context, deltaSeconds) {
    jitterYaw(state, context, params.turnJitter, deltaSeconds);
    // A mean-reverting random walk: its spread settles at speedVariation.
    const pull = deltaSeconds / SPEED_SETTLE_SECONDS;
    const kick = context.rng.normal(0, params.speedVariation * Math.sqrt(2 * pull));
    state.speed = clamp(state.speed + (1 - state.speed) * pull + kick, SLOWEST, FASTEST);
    driftHeight(state, context, params.heightChangeSeconds, deltaSeconds);
  },
};
