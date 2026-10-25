import { Vector3 } from "three";
import type { Prop } from "./layout";
import { floorHeight, type FloorHeight } from "./terrain";

/**
 * Obstacles: the solid objects of the scenery (rocks, corals, wood) that
 * fish swim around instead of through. Each is a simple shape, an ellipsoid
 * (most centred on the object's base), rough enough to be cheap and close enough that a fish
 * brushing past seems to touch the object. Plants are soft and are not
 * obstacles; the sand and the rockwork are the seabed (see steering).
 */

/**
 * The shape of a prop, relative to its size (its rough diameter): the
 * ellipsoid's semi-axes across its width (x), up (y) and along its depth (z)
 * before the prop's rotation. It is the object's `collision` trait; for the
 * procedural objects, measured on their meshes, and a render test keeps the
 * two in step.
 */
export interface PropShape {
  readonly across: number;
  readonly up: number;
  readonly along: number;
  /** Vertical offset of the base relative to the size: < 0 sinks it into the sand. */
  readonly sink: number;
  /**
   * Height of the ellipsoid's centre above the base, relative to the size:
   * a table coral's plate is raised on its stalk, and fish swim under it.
   */
  readonly lift: number;
}

export interface Obstacle {
  /** The centre of its ellipsoid, tank coordinates. */
  readonly center: Vector3;
  /** Semi-axes in its own frame (across, up, along), m. */
  readonly radii: Vector3;
  /** Cosine and sine of its rotation about the vertical axis. */
  readonly cos: number;
  readonly sin: number;
  /** Its longest semi-axis, m: nothing of it lies farther from the centre. */
  readonly reach: number;
}

/** The obstacle a prop is, standing where the renderer stands it, on the scene's floor. */
export function obstacleOf(prop: Prop, floor: FloorHeight = floorHeight): Obstacle {
  const { shape } = prop;
  const base = floor(prop.x, prop.z) + (prop.elevation ?? 0) + shape.sink * prop.size;
  const middle = base + shape.lift * prop.size;
  const radii = new Vector3(shape.across, shape.up, shape.along).multiplyScalar(prop.size);
  return {
    center: new Vector3(prop.x, middle, prop.z),
    radii,
    cos: Math.cos(prop.rotation),
    sin: Math.sin(prop.rotation),
    reach: Math.max(radii.x, radii.y, radii.z),
  };
}

/** How high a prop reaches above the sand it stands on, m. */
export function propTop(prop: Pick<Prop, "shape" | "size">): number {
  const { shape, size } = prop;
  return (shape.sink + shape.lift + shape.up) * size;
}

/** Every solid prop as an obstacle; fish swim through the others. */
export function obstaclesOf(props: readonly Prop[], floor: FloorHeight = floorHeight): Obstacle[] {
  return props.filter((prop) => prop.solid).map((prop) => obstacleOf(prop, floor));
}

/** Where fish find the obstacles around them. */
export interface ObstacleField {
  /**
   * The distance from `point` to the surface of the nearest obstacle, m:
   * negative inside one. Writes the outward normal there into `normal`.
   * Infinity, leaving `normal` alone, when no obstacle lies within `within`.
   * Approximate (exact on the axes), which is plenty for steering.
   * Allocation-free.
   */
  distance(point: Vector3, normal: Vector3, within: number): number;
}

const NO_OBSTACLES: ObstacleField = { distance: () => Infinity };

/** Side of the cells (seen from above) the field sorts obstacles into, m. */
const CELL_SIZE = 0.5;

/**
 * Obstacles sorted into a grid of cells seen from above, each listed in
 * every cell its reach overlaps, so a query only looks at those nearby.
 */
interface Grid {
  readonly cells: readonly (readonly Obstacle[])[];
  readonly minX: number;
  readonly minZ: number;
  readonly columns: number;
  readonly rows: number;
}

function gridOf(obstacles: readonly Obstacle[]): Grid {
  const minX = Math.min(...obstacles.map((obstacle) => obstacle.center.x - obstacle.reach));
  const minZ = Math.min(...obstacles.map((obstacle) => obstacle.center.z - obstacle.reach));
  const maxX = Math.max(...obstacles.map((obstacle) => obstacle.center.x + obstacle.reach));
  const maxZ = Math.max(...obstacles.map((obstacle) => obstacle.center.z + obstacle.reach));
  const columns = Math.floor((maxX - minX) / CELL_SIZE) + 1;
  const rows = Math.floor((maxZ - minZ) / CELL_SIZE) + 1;
  const cells = Array.from({ length: columns * rows }, (): Obstacle[] => []);
  for (const obstacle of obstacles) {
    const { center, reach } = obstacle;
    const fromColumn = Math.floor((center.x - reach - minX) / CELL_SIZE);
    const toColumn = Math.floor((center.x + reach - minX) / CELL_SIZE);
    const fromRow = Math.floor((center.z - reach - minZ) / CELL_SIZE);
    const toRow = Math.floor((center.z + reach - minZ) / CELL_SIZE);
    for (let row = fromRow; row <= toRow; row += 1) {
      for (let column = fromColumn; column <= toColumn; column += 1) {
        cells[row * columns + column]?.push(obstacle);
      }
    }
  }
  return { cells, minX, minZ, columns, rows };
}

/** A field over fixed obstacles; build a new one when the scenery changes. */
export function createObstacleField(obstacles: readonly Obstacle[]): ObstacleField {
  if (obstacles.length === 0) return NO_OBSTACLES;
  const { cells, minX, minZ, columns, rows } = gridOf(obstacles);
  let best = Infinity;

  /** Measures one obstacle, keeping it in `best` and `normal` when it is the nearest yet. */
  const measure = (obstacle: Obstacle, point: Vector3, normal: Vector3, within: number): void => {
    const { center, radii, cos, sin, reach } = obstacle;
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const dz = point.z - center.z;
    const limit = Math.min(within, best) + reach;
    if (dx * dx + dy * dy + dz * dz >= limit * limit) return;
    // Into the obstacle's own frame, undoing its turn about y.
    const x = dx * cos - dz * sin;
    const z = dx * sin + dz * cos;
    // Ellipsoid distance estimate: k0 (k0 - 1) / k1, see
    // https://iquilezles.org/articles/ellipsoids/ ; its gradient is p / r².
    const sx = x / radii.x;
    const sy = dy / radii.y;
    const sz = z / radii.z;
    const k0 = Math.hypot(sx, sy, sz);
    const gx = sx / radii.x;
    const gy = sy / radii.y;
    const gz = sz / radii.z;
    const k1 = Math.hypot(gx, gy, gz);
    // Right at its centre the gradient vanishes: the way out is up.
    const distance = k1 === 0 ? -Math.min(radii.x, radii.y, radii.z) : (k0 * (k0 - 1)) / k1;
    if (distance >= best || distance >= within) return;
    best = distance;
    if (k1 === 0) normal.set(0, 1, 0);
    // Back into the tank's frame.
    else normal.set((gx * cos + gz * sin) / k1, gy / k1, (-gx * sin + gz * cos) / k1);
  };

  return {
    distance(point, normal, within) {
      best = Infinity;
      const fromColumn = Math.max(Math.floor((point.x - within - minX) / CELL_SIZE), 0);
      const toColumn = Math.min(Math.floor((point.x + within - minX) / CELL_SIZE), columns - 1);
      const fromRow = Math.max(Math.floor((point.z - within - minZ) / CELL_SIZE), 0);
      const toRow = Math.min(Math.floor((point.z + within - minZ) / CELL_SIZE), rows - 1);
      for (let row = fromRow; row <= toRow; row += 1) {
        for (let column = fromColumn; column <= toColumn; column += 1) {
          const cell = cells[row * columns + column];
          if (cell === undefined) continue;
          for (const obstacle of cell) measure(obstacle, point, normal, within);
        }
      }
      return best;
    },
  };
}

const otherNormal = new Vector3();

/** One field over several: the nearest surface of any of them. Allocation-free. */
export function combineFields(...fields: readonly ObstacleField[]): ObstacleField {
  return {
    distance(point, normal, within) {
      let best = Infinity;
      for (const field of fields) {
        const distance = field.distance(point, otherNormal, Math.min(within, best));
        if (distance < best) {
          best = distance;
          normal.copy(otherNormal);
        }
      }
      return best;
    },
  };
}

/** Directions tried, evenly round, when looking for the way out. */
const OPEN_DIRECTIONS = 12;
const lookout = new Vector3();
const lookoutNormal = new Vector3();

/**
 * The heading seen from above (radians, 0 is +x) along which the space
 * around `position` is most open: the one whose point `distance` m away lies
 * farthest from any obstacle. The way out of a pocket. Allocation-free.
 */
export function openYaw(field: ObstacleField, position: Vector3, distance: number): number {
  let bestYaw = 0;
  let bestRoom = -Infinity;
  for (let index = 0; index < OPEN_DIRECTIONS; index += 1) {
    const yaw = (index / OPEN_DIRECTIONS) * Math.PI * 2;
    lookout.set(
      position.x + Math.cos(yaw) * distance,
      position.y,
      position.z + Math.sin(yaw) * distance,
    );
    const room = Math.min(field.distance(lookout, lookoutNormal, distance), distance);
    if (room > bestRoom) {
      bestRoom = room;
      bestYaw = yaw;
    }
  }
  return bestYaw;
}
