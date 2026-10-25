import { createRng } from "../core/rng";

/**
 * Which of `count` shape variants an item shows: the one its spot names
 * (wrapped round if there are fewer), else one drawn from its own seed, so
 * it looks the same whatever else the scene holds.
 */
export function variantOf(
  item: { readonly seed: number; readonly variant?: number },
  count: number,
): number {
  return item.variant === undefined ? createRng(item.seed).int(0, count - 1) : item.variant % count;
}
