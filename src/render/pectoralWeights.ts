import { smoothstep } from "../core/math";
import type { PectoralFin } from "../scene/modelManifest";

/**
 * How far in from `side` the fin blends into the body, body lengths: the
 * skin where it joins the body stretches rather than tears.
 */
const JOIN = 0.015;

/**
 * How much each point of a model belongs to a pectoral fin (aPectoral, 0
 * body .. 1 fin), from the fin's box in its manifest. `positions` are
 * x, y, z triples in the fish frame.
 */
export function pectoralWeights(positions: ArrayLike<number>, fin: PectoralFin): Float32Array {
  const weights = new Float32Array(Math.floor(positions.length / 3));
  for (let index = 0; index < weights.length; index += 1) {
    const x = positions[index * 3] ?? 0;
    const y = positions[index * 3 + 1] ?? 0;
    const z = positions[index * 3 + 2] ?? 0;
    const inBox = x >= fin.back && x <= fin.front && y >= fin.bottom && y <= fin.top;
    weights[index] = inBox ? smoothstep(fin.side - JOIN, fin.side, Math.abs(z)) : 0;
  }
  return weights;
}
