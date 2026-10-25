import { cellIndex, cellCount, type BlockGrid } from "../scene/blocks";
import { MAX_PROPS_PER_ENTRY, type PropSpec, type RockworkSpec } from "../scene/schema";
import type { Prop } from "./layout";
import { LOOSE_ROCK, type Rockwork } from "./rockwork";
import { floorHeight, type FloorHeight } from "./terrain";

/**
 * Turning a procedural reef ridge into rock built from blocks, so the scene
 * editor can reshape it: the ridge's surface as columns of blocks, and its
 * loose rocks as objects at chosen spots.
 */

interface TankSize {
  readonly width: number;
  readonly depth: number;
}

const DEGREES_PER_RADIAN = 180 / Math.PI;

/**
 * The cells of the grid under the ridge's surface on the scene's floor,
 * measured at the middle of each column.
 */
export function ridgeCells(
  tank: TankSize,
  grid: BlockGrid,
  ridge: Rockwork,
  floor: FloorHeight = floorHeight,
): Uint8Array {
  const cells = new Uint8Array(cellCount(grid));
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const x = -tank.width / 2 + (column + 0.5) * grid.size;
      const z = -tank.depth + (row + 0.5) * grid.size;
      const height = ridge.heightAt(x, z);
      if (height <= 0) continue;
      const layers = Math.min(Math.round((floor(x, z) + height) / grid.size), grid.layers);
      for (let layer = 0; layer < layers; layer += 1) {
        cells[cellIndex(grid, column, layer, row)] = 1;
      }
    }
  }
  return cells;
}

/**
 * The ridge's loose rocks as prop entries of chosen spots, where they lay:
 * as many entries as it takes, an entry holding at most MAX_PROPS_PER_ENTRY.
 */
export function looseRocksEntries(ridge: Rockwork, spec: RockworkSpec): PropSpec[] {
  const entries: PropSpec[] = [];
  for (let start = 0; start < ridge.rocks.length; start += MAX_PROPS_PER_ENTRY) {
    entries.push(looseRocksEntry(ridge.rocks.slice(start, start + MAX_PROPS_PER_ENTRY), spec));
  }
  return entries;
}

function looseRocksEntry(rocks: readonly Prop[], spec: RockworkSpec): PropSpec {
  return {
    kind: LOOSE_ROCK,
    count: rocks.length,
    color: spec.color,
    ...(spec.material === undefined ? {} : { material: spec.material }),
    at: rocks.map((rock) => ({
      x: rock.x,
      z: rock.z,
      ...(rock.elevation === undefined ? {} : { y: rock.elevation }),
      rotation: rock.rotation * DEGREES_PER_RADIAN,
      size: rock.size,
    })),
  };
}
