/** Below this short side, in CSS pixels, a touch screen is a phone, not a tablet. */
const PHONE_SHORT_SIDE = 600;

/** What the browser tells about the device, read by the app (no DOM here). */
export interface DeviceHints {
  /** The main pointer is a finger (`(pointer: coarse)`). */
  readonly coarsePointer: boolean;
  /** The screen's shorter side, CSS pixels. */
  readonly shortSide: number;
  /** `navigator.userAgentData.mobile`, where the browser offers it. */
  readonly mobileHint: boolean | undefined;
}

/**
 * Whether the aquarium runs on a phone: Aquaria is made for large displays,
 * and a phone gets a small demo tank it can draw smoothly instead.
 */
export function isPhone(hints: DeviceHints): boolean {
  if (hints.mobileHint === true) return true;
  return hints.coarsePointer && hints.shortSide < PHONE_SHORT_SIDE;
}
