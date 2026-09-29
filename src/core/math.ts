export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Position of `value` inside [from, to], unclamped; 0 when the range is empty. */
export function inverseLerp(from: number, to: number, value: number): number {
  return from === to ? 0 : (value - from) / (to - from);
}

/** Hermite smoothstep, identical to the GLSL built-in. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp(inverseLerp(edge0, edge1, value), 0, 1);
  return t * t * (3 - 2 * t);
}
