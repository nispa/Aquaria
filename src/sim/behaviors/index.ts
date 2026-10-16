import type { SwimSpec, SwimStyleId } from "../../scene/swimming";
import { burstCoastStyle } from "./burstCoast";
import { cruiseStyle } from "./cruise";
import { glideStyle } from "./glide";
import { hoverStyle } from "./hover";
import { patrolStyle } from "./patrol";
import type { SwimStyle } from "./types";

export { activityOf, doesMoreThanWander, evenRests } from "./activities";
export { createActivityChooser, restfulness } from "./choose";
export { nestlePoint } from "./hover";
export { settleDown } from "./shared";
export {
  createActivityState,
  createSwimState,
  type ActivityState,
  type SwimContext,
  type SwimState,
} from "./types";

/**
 * Every swimming style, by id. To add a style, declare its parameters in
 * `scene/swimming.ts`, write it in a file of its own here and list it below;
 * the type makes sure no declared style is left without one.
 */
export const SWIM_STYLES: { readonly [Id in SwimStyleId]: SwimStyle<Id> } = {
  cruise: cruiseStyle,
  "burst-coast": burstCoastStyle,
  hover: hoverStyle,
  glide: glideStyle,
  patrol: patrolStyle,
};

/** The style a species' `swim` entry asks for. */
export function swimStyleOf(spec: SwimSpec): SwimStyle<SwimStyleId> {
  return SWIM_STYLES[spec.style];
}
