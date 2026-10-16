import type { Vector3 } from "three";

/**
 * The crowd: fish as bodies that take up room. Schools space their own
 * members (steering's separation); the crowd keeps fish of different species
 * out of each other's way, the smaller giving way to the larger, and pulls
 * apart any two bodies that still overlap, whatever their species.
 */

export interface Body {
  readonly position: Vector3;
  /** Body length, m. */
  readonly length: number;
  /** Only compared: fish of the same species leave spacing to their school. */
  readonly species: unknown;
}

/** The area (seen from above) the fish swim in, m; fish outside it are still found. */
export interface CrowdBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface Crowd {
  /** Sorts the bodies into cells; call once per step, before the other queries. */
  sort(bodies: readonly Body[]): void;
  /**
   * Adds to `out` the push away from fish of other species within the
   * personal space of `body` and returns `out`: up to 1 for a fish right on
   * top of one its size, more from a larger one, less from a smaller one.
   */
  addPersonalSpace(body: Body, out: Vector3): Vector3;
  /** Moves apart every two sorted bodies that overlap, the smaller one more. */
  separate(): void;
}

/** A fish's personal space, as a radius in body lengths. */
const PERSONAL_SPACE_BODY_LENGTHS = 0.5;
/** Two bodies overlap closer than this share of their personal spaces. */
const BODY_SHARE = 0.5;
/** Cells are never smaller than this, m, so tiny fish do not make a huge grid. */
const MIN_CELL_SIZE = 0.1;

const radiusOf = (body: Body): number => body.length * PERSONAL_SPACE_BODY_LENGTHS;

/** A crowd over a fixed area; the grid reuses its arrays from step to step. */
export function createCrowd(bounds: CrowdBounds): Crowd {
  let bodies: readonly Body[] = [];
  let cellSize = MIN_CELL_SIZE;
  let columns = 1;
  let rows = 1;
  /** Bodies' indices ordered by cell, and where each cell's run starts (one extra at the end). */
  let order = new Int32Array(0);
  let cellOfBody = new Int32Array(0);
  let cellStart = new Int32Array(2);

  const columnOf = (x: number): number =>
    Math.min(Math.max(Math.floor((x - bounds.minX) / cellSize), 0), columns - 1);
  const rowOf = (z: number): number =>
    Math.min(Math.max(Math.floor((z - bounds.minZ) / cellSize), 0), rows - 1);

  /**
   * Calls `visit` with the index of every body in the cells around `body`,
   * which holds every body whose personal space can touch its own.
   */
  const forEachNear = (body: Body, visit: (index: number) => void): void => {
    const column = columnOf(body.position.x);
    const row = rowOf(body.position.z);
    for (let r = Math.max(row - 1, 0); r <= Math.min(row + 1, rows - 1); r += 1) {
      for (let c = Math.max(column - 1, 0); c <= Math.min(column + 1, columns - 1); c += 1) {
        const cell = r * columns + c;
        const end = cellStart[cell + 1] ?? 0;
        for (let slot = cellStart[cell] ?? 0; slot < end; slot += 1) visit(order[slot] ?? 0);
      }
    }
  };

  // The body being queried and the output, shared with the visitors so
  // queries allocate no closures.
  let subject: Body | undefined;
  let subjectIndex = -1;
  let push: Vector3 | undefined;

  const pushAway = (index: number): void => {
    const other = bodies[index];
    if (subject === undefined || push === undefined || other === undefined) return;
    if (other === subject || other.species === subject.species) return;
    const mine = radiusOf(subject);
    const theirs = radiusOf(other);
    const reach = mine + theirs;
    const dx = subject.position.x - other.position.x;
    const dy = subject.position.y - other.position.y;
    const dz = subject.position.z - other.position.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance === 0 || distance >= reach) return;
    // The larger the other, the harder it pushes: 1 between equals.
    const strength = ((reach - distance) / reach) * ((2 * theirs) / reach);
    push.x += (dx / distance) * strength;
    push.y += (dy / distance) * strength;
    push.z += (dz / distance) * strength;
  };

  const pullApart = (index: number): void => {
    const other = bodies[index];
    if (subject === undefined || other === undefined || index <= subjectIndex) return;
    const mine = radiusOf(subject);
    const theirs = radiusOf(other);
    const least = (mine + theirs) * BODY_SHARE;
    let dx = subject.position.x - other.position.x;
    const dy = subject.position.y - other.position.y;
    const dz = subject.position.z - other.position.z;
    let distance = Math.hypot(dx, dy, dz);
    if (distance >= least) return;
    if (distance === 0) {
      // Exactly on top of each other: either way will do.
      dx = -1;
      distance = 1;
    }
    const overlap = least - distance;
    // Each moves by the other's share: the smaller moves more.
    const mineMoves = (overlap * theirs) / (mine + theirs) / distance;
    const theirsMoves = (overlap * mine) / (mine + theirs) / distance;
    subject.position.x += dx * mineMoves;
    subject.position.y += dy * mineMoves;
    subject.position.z += dz * mineMoves;
    other.position.x -= dx * theirsMoves;
    other.position.y -= dy * theirsMoves;
    other.position.z -= dz * theirsMoves;
  };

  return {
    sort(next) {
      bodies = next;
      let largest = 0;
      for (const body of next) largest = Math.max(largest, radiusOf(body));
      // Two personal spaces touch within 2 * largest: one cell either way.
      cellSize = Math.max(2 * largest, MIN_CELL_SIZE);
      columns = Math.max(Math.ceil((bounds.maxX - bounds.minX) / cellSize), 1);
      rows = Math.max(Math.ceil((bounds.maxZ - bounds.minZ) / cellSize), 1);
      const cells = columns * rows;
      if (cellStart.length < cells + 1) cellStart = new Int32Array(cells + 1);
      if (order.length < next.length) {
        order = new Int32Array(next.length);
        cellOfBody = new Int32Array(next.length);
      }
      cellStart.fill(0);
      for (let index = 0; index < next.length; index += 1) {
        const position = next[index]?.position;
        if (position === undefined) continue;
        const cell = rowOf(position.z) * columns + columnOf(position.x);
        cellOfBody[index] = cell;
        cellStart[cell + 1] = (cellStart[cell + 1] ?? 0) + 1;
      }
      for (let cell = 0; cell < cells; cell += 1) {
        cellStart[cell + 1] = (cellStart[cell + 1] ?? 0) + (cellStart[cell] ?? 0);
      }
      // Fill each cell's run, counting down from its end.
      for (let index = next.length - 1; index >= 0; index -= 1) {
        const cell = cellOfBody[index] ?? 0;
        const end = (cellStart[cell + 1] ?? 0) - 1;
        cellStart[cell + 1] = end;
        order[end] = index;
      }
      // Counting down left each cell's start one place on: shift it back.
      for (let cell = 0; cell < cells; cell += 1) cellStart[cell] = cellStart[cell + 1] ?? 0;
      cellStart[cells] = next.length;
    },
    addPersonalSpace(body, out) {
      subject = body;
      push = out;
      forEachNear(body, pushAway);
      return out;
    },
    separate() {
      for (let index = 0; index < bodies.length; index += 1) {
        const body = bodies[index];
        if (body === undefined) continue;
        subject = body;
        subjectIndex = index;
        forEachNear(body, pullApart);
      }
    },
  };
}
