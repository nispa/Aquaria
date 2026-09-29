/** Maximum height of the sand dunes above or below y = 0, in meters. */
export const FLOOR_AMPLITUDE = 0.12;

// Three incommensurate ripples; weights sum to 1 so the amplitude bound holds.
const RIPPLES = [
  { weight: 0.55, x: 0.45, z: 0.3, phase: 0.4 },
  { weight: 0.3, x: -0.9, z: 0.75, phase: 1.7 },
  { weight: 0.15, x: 2.1, z: -1.6, phase: 2.9 },
] as const;

/**
 * Height of the sandy floor at (x, z). Shared by the floor mesh and by props,
 * so rocks and the starfish sit on the sand instead of floating above it.
 */
export function floorHeight(x: number, z: number): number {
  let height = 0;
  for (const ripple of RIPPLES) {
    height += ripple.weight * Math.sin(x * ripple.x + z * ripple.z + ripple.phase);
  }
  return height * FLOOR_AMPLITUDE;
}
