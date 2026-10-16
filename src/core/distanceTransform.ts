/**
 * Exact Euclidean distance transform on a 3D grid (Felzenszwalb and
 * Huttenlocher, "Distance Transforms of Sampled Functions", 2012): for every
 * cell, the squared distance in cells to the nearest marked cell. Separable,
 * one pass of the 1D transform per axis, linear in the number of cells.
 */

/** Where the parabolas rooted at cells `left` < `right` of `heights` cross. */
function crossing(heights: Float64Array, left: number, right: number): number {
  const leftHeight = (heights[left] ?? 0) + left * left;
  const rightHeight = (heights[right] ?? 0) + right * right;
  return (rightHeight - leftHeight) / (2 * (right - left));
}

/**
 * The 1D transform of `values` (squared distances so far, Infinity where
 * unknown), read and written at `start` with `stride`, over `count` cells.
 * `parabolas`, `bounds` and `copy` are scratch arrays of at least `count`
 * (+1 for `bounds`) entries.
 */
function transformLine(
  values: Float64Array,
  start: number,
  stride: number,
  count: number,
  parabolas: Int32Array,
  bounds: Float64Array,
  copy: Float64Array,
): void {
  for (let index = 0; index < count; index += 1) copy[index] = values[start + index * stride] ?? 0;
  // The lower envelope of the parabolas rooted at the finite cells.
  let hull = -1;
  for (let cell = 0; cell < count; cell += 1) {
    const height = copy[cell] ?? Infinity;
    if (height === Infinity) continue;
    // Drop the parabolas the new one hides entirely.
    while (hull >= 0 && crossing(copy, parabolas[hull] ?? 0, cell) <= (bounds[hull] ?? -Infinity)) {
      hull -= 1;
    }
    bounds[hull + 1] = hull < 0 ? -Infinity : crossing(copy, parabolas[hull] ?? 0, cell);
    hull += 1;
    parabolas[hull] = cell;
    bounds[hull + 1] = Infinity;
  }
  if (hull < 0) return;
  let segment = 0;
  for (let cell = 0; cell < count; cell += 1) {
    while ((bounds[segment + 1] ?? Infinity) < cell) segment += 1;
    const root = parabolas[segment] ?? 0;
    values[start + cell * stride] = (cell - root) * (cell - root) + (copy[root] ?? 0);
  }
}

/**
 * Squared distances, in cells, from every cell of a grid of `size` = [x, y,
 * z] (x fastest, then y, then z) to the nearest cell where `marked` is not
 * 0; Infinity everywhere when nothing is marked.
 */
export function squaredDistances(
  marked: Uint8Array,
  size: readonly [number, number, number],
): Float64Array {
  const [sizeX, sizeY, sizeZ] = size;
  const values = new Float64Array(marked.length);
  for (let index = 0; index < marked.length; index += 1) {
    values[index] = marked[index] === 0 ? Infinity : 0;
  }
  const longest = Math.max(sizeX, sizeY, sizeZ);
  const parabolas = new Int32Array(longest);
  const bounds = new Float64Array(longest + 1);
  const copy = new Float64Array(longest);
  const layer = sizeX * sizeY;
  for (let z = 0; z < sizeZ; z += 1) {
    for (let y = 0; y < sizeY; y += 1) {
      transformLine(values, z * layer + y * sizeX, 1, sizeX, parabolas, bounds, copy);
    }
  }
  for (let z = 0; z < sizeZ; z += 1) {
    for (let x = 0; x < sizeX; x += 1) {
      transformLine(values, z * layer + x, sizeX, sizeY, parabolas, bounds, copy);
    }
  }
  for (let y = 0; y < sizeY; y += 1) {
    for (let x = 0; x < sizeX; x += 1) {
      transformLine(values, y * sizeX + x, layer, sizeZ, parabolas, bounds, copy);
    }
  }
  return values;
}
