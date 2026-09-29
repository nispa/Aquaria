import type { Box3 } from "three";
import { Vector3 } from "three";
import { clamp } from "../core/math";
import type { Rng } from "../core/rng";
import {
  MAX_INDIVIDUALS_PER_SPECIES,
  type Scene,
  type Species,
  type SpeciesCatalog,
} from "../scene/schema";
import { createCurrentField, type CurrentField } from "./current";
import { addAlignment, addCohesion, addContainment, addSeparation } from "./steering";
import { habitatBox } from "./tank";

/** Default cap on fish alive at once, including those entering and leaving. */
export const TOTAL_FISH_LIMIT = 300;

/** Distance beyond the side walls where new fish appear, in meters. */
const SPAWN_OFFSET = 1;
/** Distance beyond the side walls where leaving fish are removed, in meters. */
const EXIT_OFFSET = 1.5;
/** Soft-wall thickness, in meters (capped for thin habitats). */
const CONTAINMENT_MARGIN = 0.5;
/** Smallest length a randomly drawn individual may have, relative to the mean. */
const MIN_LENGTH_RATIO = 0.5;

// Steering weights. Forces are scaled by each species' cruise speed so slow
// and fast species feel equally responsive.
const SEPARATION_WEIGHT = 1.5;
const COHESION_WEIGHT = 0.8;
const ALIGNMENT_WEIGHT = 1.2;
const CONTAINMENT_WEIGHT = 2.5;
const WANDER_WEIGHT = 0.6;
const SPEED_RESPONSE = 1.5;
const TRANSIT_PULL = 2;

/** Separation radius in body lengths. */
const SEPARATION_BODY_LENGTHS = 2.5;
/** Neighbour radius for schooling, in body lengths. */
const SCHOOL_BODY_LENGTHS = 12;
/** Fish never slow below this fraction of cruise speed, so they always have a heading. */
const MIN_SPEED_RATIO = 0.35;
/** Fish swim mostly horizontally: vertical velocity is capped to this fraction of speed. */
const MAX_VERTICAL_RATIO = 0.35;
/** Wander yaw jitter, radians per sqrt(second). */
const WANDER_JITTER = 0.9;
/** Depth component of the wander direction, relative to x (fish prefer crossing the view). */
const WANDER_DEPTH_RATIO = 0.5;
/** Tail beats per body length travelled, a rough real-world ratio. */
const SWIM_BEATS_PER_BODY_LENGTH = 0.9;

export type FishState = "entering" | "swimming" | "leaving";

export interface Fish {
  readonly id: number;
  readonly species: Species;
  readonly position: Vector3;
  readonly velocity: Vector3;
  /** Body length of this individual, in meters. */
  readonly length: number;
  /** Tail-beat phase in radians; renderers use sin(swimPhase). */
  swimPhase: number;
  /** 0..1, fish fade in and out at the side walls. */
  opacity: number;
  state: FishState;
  /** Wander heading (yaw) in radians. */
  wanderAngle: number;
  /** -1 or 1: which side wall the fish is travelling through when entering or leaving. */
  side: number;
}

export interface SimulationOptions {
  readonly scene: Scene;
  readonly catalog: SpeciesCatalog;
  readonly rng: Rng;
  readonly fishLimit?: number;
}

export interface Simulation {
  /** Every fish currently alive. Do not mutate from outside the simulation. */
  readonly fish: readonly Fish[];
  readonly current: CurrentField;
  readonly timeSeconds: number;
  /** Advances the simulation by one fixed step. */
  step(deltaSeconds: number): void;
  /** Requests a new population for a species; fish swim in or out gradually. */
  setCount(speciesId: string, count: number): void;
  targetCount(speciesId: string): number;
}

interface Group {
  readonly species: Species;
  readonly habitat: Box3;
  /** Entering and swimming fish. */
  readonly members: Fish[];
  /** Positions of `members`, kept in sync so steering needs no per-frame arrays. */
  readonly positions: Vector3[];
  readonly leaving: Fish[];
  target: number;
}

function removeItem<T>(items: T[], item: T): void {
  const index = items.indexOf(item);
  if (index >= 0) items.splice(index, 1);
}

export function createSimulation(options: SimulationOptions): Simulation {
  const { scene, catalog, rng } = options;
  const fishLimit = options.fishLimit ?? TOTAL_FISH_LIMIT;
  const halfWidth = scene.tank.width / 2;
  const current = createCurrentField(scene.current);
  const fish: Fish[] = [];
  const groups = new Map<string, Group>();
  let nextId = 0;
  let timeSeconds = 0;

  for (const species of catalog.species) {
    groups.set(species.id, {
      species,
      habitat: habitatBox(scene.tank, species),
      members: [],
      positions: [],
      leaving: [],
      target: 0,
    });
  }

  const groupOf = (speciesId: string): Group => {
    const group = groups.get(speciesId);
    if (group === undefined) {
      throw new Error(`Unknown species "${speciesId}".`);
    }
    return group;
  };

  const drawLength = (species: Species): number =>
    Math.max(
      rng.normal(species.length.mean, species.length.standardDeviation),
      species.length.mean * MIN_LENGTH_RATIO,
    );

  const marginFor = (box: Box3): number =>
    Math.min(CONTAINMENT_MARGIN, (box.max.y - box.min.y) / 3, (box.max.z - box.min.z) / 3);

  const createFish = (group: Group, entering: boolean): Fish => {
    const { species, habitat } = group;
    const margin = marginFor(habitat);
    const side = rng.next() < 0.5 ? -1 : 1;
    const x = entering
      ? side * (halfWidth + SPAWN_OFFSET)
      : rng.range(habitat.min.x + margin, habitat.max.x - margin);
    const position = new Vector3(
      x,
      rng.range(habitat.min.y + margin, habitat.max.y - margin),
      rng.range(habitat.min.z + margin, habitat.max.z - margin),
    );
    const angle = entering ? (side > 0 ? Math.PI : 0) : rng.range(0, Math.PI * 2);
    const velocity = new Vector3(Math.cos(angle), 0, Math.sin(angle) * WANDER_DEPTH_RATIO)
      .normalize()
      .multiplyScalar(species.speed.cruise);
    return {
      id: nextId++,
      species,
      position,
      velocity,
      length: drawLength(species),
      swimPhase: rng.range(0, Math.PI * 2),
      opacity: entering ? 0 : 1,
      state: entering ? "entering" : "swimming",
      wanderAngle: angle,
      side,
    };
  };

  const addMember = (group: Group, member: Fish): void => {
    group.members.push(member);
    group.positions.push(member.position);
  };

  /** Brings the number of active fish in a group towards its target. */
  const reconcile = (group: Group): void => {
    while (group.members.length < group.target && group.leaving.length > 0) {
      const recalled = group.leaving.pop();
      if (recalled === undefined) break;
      recalled.state = "swimming";
      addMember(group, recalled);
    }
    while (group.members.length < group.target && fish.length < fishLimit) {
      const newcomer = createFish(group, true);
      fish.push(newcomer);
      addMember(group, newcomer);
    }
    while (group.members.length > group.target) {
      const surplus = group.members.pop();
      group.positions.pop();
      if (surplus === undefined) break;
      surplus.state = "leaving";
      surplus.side = surplus.position.x >= 0 ? 1 : -1;
      group.leaving.push(surplus);
    }
  };

  // Initial population: already swimming inside the tank.
  for (const entry of scene.fauna) {
    const group = groupOf(entry.species);
    group.target = entry.count;
    while (group.members.length < entry.count && fish.length < fishLimit) {
      const member = createFish(group, false);
      fish.push(member);
      addMember(group, member);
    }
  }

  // Scratch vectors reused every step: no allocations in the hot loop.
  const force = new Vector3();
  const term = new Vector3();
  const drift = new Vector3();

  const steer = (group: Group, member: Fish, deltaSeconds: number): void => {
    const { species, habitat } = group;
    const cruise = species.speed.cruise;
    force.set(0, 0, 0);

    term.set(0, 0, 0);
    addSeparation(member.position, group.positions, member.length * SEPARATION_BODY_LENGTHS, term);
    force.addScaledVector(term, SEPARATION_WEIGHT);

    if (species.schooling > 0 && member.state === "swimming") {
      const radius = member.length * SCHOOL_BODY_LENGTHS;
      term.set(0, 0, 0);
      addCohesion(member.position, group.positions, radius, term);
      force.addScaledVector(term, COHESION_WEIGHT * species.schooling);
      term.set(0, 0, 0);
      addAlignment(member.position, member.velocity, group.members, radius, term);
      force.addScaledVector(term, (ALIGNMENT_WEIGHT * species.schooling) / cruise);
    }

    term.set(0, 0, 0);
    addContainment(member.position, habitat, marginFor(habitat), term, {
      ignoreX: member.state !== "swimming",
    });
    force.addScaledVector(term, CONTAINMENT_WEIGHT);

    if (member.state === "swimming") {
      member.wanderAngle += rng.normal(0, WANDER_JITTER * Math.sqrt(deltaSeconds));
      force.x += Math.cos(member.wanderAngle) * WANDER_WEIGHT;
      force.z += Math.sin(member.wanderAngle) * WANDER_WEIGHT * WANDER_DEPTH_RATIO;
    } else {
      // Entering fish head inwards (away from their side), leaving fish head out.
      const direction = member.state === "entering" ? -member.side : member.side;
      force.x += direction * TRANSIT_PULL;
    }

    const speed = member.velocity.length();
    term.copy(member.velocity).multiplyScalar(((cruise - speed) / speed) * SPEED_RESPONSE);
    force.multiplyScalar(cruise).add(term);

    member.velocity.addScaledVector(force, deltaSeconds);
    const maxVertical = member.velocity.length() * MAX_VERTICAL_RATIO;
    member.velocity.y = clamp(member.velocity.y, -maxVertical, maxVertical);
    const clamped = clamp(member.velocity.length(), cruise * MIN_SPEED_RATIO, species.speed.max);
    member.velocity.setLength(clamped);
  };

  const move = (member: Fish, deltaSeconds: number): void => {
    current.sample(member.position, timeSeconds, drift);
    member.position
      .addScaledVector(member.velocity, deltaSeconds)
      .addScaledVector(drift, deltaSeconds);
    member.swimPhase +=
      (member.velocity.length() / member.length) *
      SWIM_BEATS_PER_BODY_LENGTH *
      Math.PI *
      2 *
      deltaSeconds;
  };

  /** Updates fade and state transitions at the side walls. Returns true if the fish is gone. */
  const updateTransit = (group: Group, member: Fish): boolean => {
    const beyond = Math.abs(member.position.x) - halfWidth;
    if (member.state === "entering") {
      member.opacity = clamp(1 - beyond / SPAWN_OFFSET, 0, 1);
      if (beyond < -marginFor(group.habitat)) {
        member.state = "swimming";
        member.opacity = 1;
        member.wanderAngle = Math.atan2(member.velocity.z, member.velocity.x);
      }
      return false;
    }
    if (member.state === "leaving") {
      member.opacity = clamp(1 - beyond / EXIT_OFFSET, 0, 1);
      return beyond >= EXIT_OFFSET;
    }
    return false;
  };

  return {
    fish,
    current,
    get timeSeconds() {
      return timeSeconds;
    },
    step(deltaSeconds) {
      let removed = false;
      for (const group of groups.values()) {
        for (const member of group.members) steer(group, member, deltaSeconds);
        for (const member of group.leaving) steer(group, member, deltaSeconds);
      }
      for (const group of groups.values()) {
        for (const member of group.members) {
          move(member, deltaSeconds);
          updateTransit(group, member);
        }
        for (let index = group.leaving.length - 1; index >= 0; index -= 1) {
          const member = group.leaving[index];
          if (member === undefined) continue;
          move(member, deltaSeconds);
          if (updateTransit(group, member)) {
            group.leaving.splice(index, 1);
            removeItem(fish, member);
            removed = true;
          }
        }
      }
      if (removed) {
        for (const group of groups.values()) reconcile(group);
      }
      timeSeconds += deltaSeconds;
    },
    setCount(speciesId, count) {
      const group = groupOf(speciesId);
      group.target = clamp(Math.round(count), 0, MAX_INDIVIDUALS_PER_SPECIES);
      reconcile(group);
    },
    targetCount(speciesId) {
      return groupOf(speciesId).target;
    },
  };
}
