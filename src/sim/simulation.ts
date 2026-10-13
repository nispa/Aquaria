import type { Box3 } from "three";
import { Vector3 } from "three";
import { clamp, lerp, smoothstep } from "../core/math";
import { hashToUnit, type Rng } from "../core/rng";
import {
  MAX_INDIVIDUALS_PER_SPECIES,
  type Scene,
  type Species,
  type SpeciesCatalog,
} from "../scene/schema";
import { nextGaze, turnIntent } from "./gaze";
import { createCurrentField, type CurrentField } from "./current";
import { createFood, type Food } from "./food";
import { easeToward, tailEffort, turnBend } from "./posture";
import {
  addAlignment,
  addCohesion,
  addContainment,
  addSeabedClearance,
  addSeparation,
  type SeabedHeight,
} from "./steering";
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
const SEABED_WEIGHT = 4;
/** Fish keep this many body lengths (at least SEABED_MIN_CLEARANCE) off the seabed. */
const SEABED_BODY_LENGTHS = 1.5;
const SEABED_MIN_CLEARANCE = 0.08;
/** Hard limit: a fish's centre never gets closer to the seabed than this, in body lengths. */
const SEABED_MIN_GAP_BODY_LENGTHS = 0.5;
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
/** How far the wanted gaze must drift before the eyes jump to it. */
const GAZE_SACCADE_THRESHOLD = 0.35;
/** How quickly the body follows its turns and the tail its effort, in seconds; filters wander jitter. */
const BEND_RESPONSE_SECONDS = 0.2;
const EFFORT_RESPONSE_SECONDS = 0.3;

// Feeding. Fish notice flakes within FOOD_SENSE_RADIUS and leave their habitat
// by up to FORAGE_MARGIN to reach them, so each species feeds at its own depth.
const FOOD_SENSE_RADIUS = 3;
const FORAGE_MARGIN = 0.5;
/** Pull towards food at full hunger; stronger than schooling and wandering. */
const FEED_WEIGHT = 4;
/** A hungry fish speeds up towards food by up to this share of its cruise speed. */
const FEED_SPEED_BOOST = 0.8;
/** Hungry fish climb and dive more steeply than cruising fish. */
const FEEDING_VERTICAL_RATIO = 0.8;
/** A flake is bitten when it is this many body lengths from the mouth. */
const BITE_BODY_LENGTHS = 0.4;
/** The mouth starts opening this many body lengths from the flake and is wide open at the bite. */
const MOUTH_OPEN_BODY_LENGTHS = 3;
const MOUTH_RESPONSE_SECONDS = 0.08;
/** Satiety gained per flake, and the time a full fish takes to become hungry again. */
const BITE_SATIETY = 0.15;
const SATIETY_DECAY_SECONDS = 300;
/** Above this satiety a fish ignores food. */
const SATED = 0.8;
// The viewer. A finger on the glass draws the curious share of a species
// within CURIOSITY_RADIUS; they come to look from INSPECT_BODY_LENGTHS behind
// the glass and slow down as they arrive. A tap startles every fish within
// STARTLE_RADIUS (scaled down to MIN_STARTLE_SHARE for bold species): the
// escape reflex is all or nothing, then fear fades over FEAR_SECONDS.
const CURIOSITY_RADIUS = 3;
const CURIOSITY_WEIGHT = 2.5;
const INSPECT_BODY_LENGTHS = 2;
/** Inspecting fish slow down within this many body lengths of their spot. */
const ARRIVAL_BODY_LENGTHS = 4;
const STARTLE_RADIUS = 2.5;
const MIN_STARTLE_SHARE = 0.3;
const FLEE_WEIGHT = 6;
const FEAR_SECONDS = 2.5;
/** A mouth this nearly shut counts as closed. */
const MOUTH_CLOSED = 0.01;

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
  /** Where the eyes look, -1 (right) .. 1 (left); leads each turn. */
  gaze: number;
  /** Body curvature times length, positive into a left turn; see sim/posture. */
  bend: number;
  /** Tail-beat amplitude relative to cruising; see sim/posture. */
  effort: number;
  /** 0 hungry .. 1 full; fish ignore food above 0.8. */
  satiety: number;
  /** 0 closed .. 1 wide open, when snapping at food. */
  mouth: number;
  /** 1 right after a tap on the glass nearby, fading to 0 as the fish calms down. */
  fear: number;
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
  /** Flakes in the water. */
  readonly food: Food;
  readonly timeSeconds: number;
  /** Advances the simulation by one fixed step. */
  step(deltaSeconds: number): void;
  /**
   * Sets the seabed (sand plus rockwork) fish must keep clear of. Called on
   * every step, so it may change, e.g. when the scenery is rebuilt.
   */
  setSeabed(seabed: SeabedHeight): void;
  /** Drops a pinch of food at the surface above (x, z), tank coordinates. */
  dropFood(x: number, z: number): void;
  /**
   * Where a viewer's finger rests on the glass (tank coordinates), or
   * undefined when nobody is touching it. Curious fish come to look.
   */
  setFinger(point: Vector3 | undefined): void;
  /** A tap on the glass at `point`: nearby fish dart away. */
  tap(point: Vector3): void;
  /** Requests a new population for a species; fish swim in or out gradually. */
  setCount(speciesId: string, count: number): void;
  targetCount(speciesId: string): number;
}

interface Group {
  readonly species: Species;
  readonly habitat: Box3;
  /** The habitat widened by FORAGE_MARGIN: where this species goes for food. */
  readonly forage: Box3;
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
  let seabed: SeabedHeight = () => 0;
  let timeSeconds = 0;
  // Shares the simulation's generator: it only draws numbers when food is
  // dropped, so a tank nobody feeds plays exactly as before.
  const food = createFood({ tank: scene.tank, rng });

  for (const species of catalog.species) {
    groups.set(species.id, {
      species,
      habitat: habitatBox(scene.tank, species),
      forage: habitatBox(scene.tank, species).expandByScalar(FORAGE_MARGIN),
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
      gaze: 0,
      bend: 0,
      effort: 1,
      satiety: 0,
      mouth: 0,
      fear: 0,
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
  const previousVelocity = new Vector3();
  const mouthPosition = new Vector3();
  const finger = new Vector3();
  let fingerPresent = false;
  const tapPoint = new Vector3();
  const inspectSpot = new Vector3();

  /** Darts away from the last tap. Returns the speed the fish wants. */
  const flee = (group: Group, member: Fish): number => {
    term.subVectors(member.position, tapPoint);
    term.y *= WANDER_DEPTH_RATIO;
    if (term.lengthSq() > 0) force.addScaledVector(term.normalize(), FLEE_WEIGHT * member.fear);
    return lerp(group.species.speed.cruise, group.species.speed.max, member.fear);
  };

  /**
   * Comes to look at the finger on the glass if this individual is one of the
   * curious ones and the finger is close enough. Returns the speed the fish
   * wants: slower as it arrives, so it lingers.
   */
  const inspect = (group: Group, member: Fish): number => {
    const { species, forage: reach } = group;
    const cruise = species.speed.cruise;
    if (
      !fingerPresent ||
      member.state !== "swimming" ||
      hashToUnit(member.id) >= species.behavior.curiosity ||
      member.position.distanceTo(finger) > CURIOSITY_RADIUS
    ) {
      return cruise;
    }
    inspectSpot.copy(finger);
    inspectSpot.z -= member.length * INSPECT_BODY_LENGTHS;
    reach.clampPoint(inspectSpot, inspectSpot);
    term.subVectors(inspectSpot, member.position);
    const distance = term.length();
    if (distance > 0) force.addScaledVector(term.normalize(), CURIOSITY_WEIGHT);
    return cruise * clamp(distance / (member.length * ARRIVAL_BODY_LENGTHS), 0, 1);
  };

  /**
   * Steers a hungry fish towards the nearest flake it can reach, opens its
   * mouth on the way and eats the flake on contact. Returns the speed the fish
   * wants (faster when hungry), or its cruise speed when it is not feeding.
   */
  const forage = (group: Group, member: Fish, deltaSeconds: number): number => {
    const { species } = group;
    const cruise = species.speed.cruise;
    member.satiety = Math.max(member.satiety - deltaSeconds / SATIETY_DECAY_SECONDS, 0);
    const hunger = species.behavior.appetite * (1 - member.satiety);
    const flake =
      member.state === "swimming" && member.satiety < SATED && member.fear === 0
        ? food.nearest(member.position, FOOD_SENSE_RADIUS, group.forage)
        : undefined;
    let mouthTarget = 0;
    let speed = cruise;
    if (flake !== undefined && hunger > 0) {
      mouthPosition
        .copy(member.velocity)
        .setLength(member.length / 2)
        .add(member.position);
      const reach = mouthPosition.distanceTo(flake.position);
      term.subVectors(flake.position, mouthPosition).normalize();
      force.addScaledVector(term, FEED_WEIGHT * hunger);
      speed = Math.min(cruise * (1 + FEED_SPEED_BOOST * hunger), species.speed.max);
      mouthTarget = smoothstep(
        member.length * MOUTH_OPEN_BODY_LENGTHS,
        member.length * BITE_BODY_LENGTHS,
        reach,
      );
      if (reach <= member.length * BITE_BODY_LENGTHS) {
        food.eat(flake);
        member.satiety = Math.min(member.satiety + BITE_SATIETY, 1);
        // The snap: the mouth shuts at once on the flake.
        mouthTarget = 0;
        member.mouth = 0;
      }
    }
    member.mouth =
      mouthTarget === 0 && member.mouth < MOUTH_CLOSED
        ? 0
        : easeToward(member.mouth, mouthTarget, MOUTH_RESPONSE_SECONDS, deltaSeconds);
    return speed;
  };

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

    term.set(0, 0, 0);
    const clearance = Math.max(member.length * SEABED_BODY_LENGTHS, SEABED_MIN_CLEARANCE);
    addSeabedClearance(member.position, seabed, clearance, term);
    force.addScaledVector(term, SEABED_WEIGHT);

    if (member.state === "swimming") {
      member.wanderAngle += rng.normal(0, WANDER_JITTER * Math.sqrt(deltaSeconds));
      force.x += Math.cos(member.wanderAngle) * WANDER_WEIGHT;
      force.z += Math.sin(member.wanderAngle) * WANDER_WEIGHT * WANDER_DEPTH_RATIO;
    } else {
      // Entering fish head inwards (away from their side), leaving fish head out.
      const direction = member.state === "entering" ? -member.side : member.side;
      force.x += direction * TRANSIT_PULL;
    }

    // Reactions in order of urgency: fear, then food, then curiosity.
    member.fear = Math.max(member.fear - deltaSeconds / FEAR_SECONDS, 0);
    const feedingSpeed = forage(group, member, deltaSeconds);
    let wantedSpeed = feedingSpeed;
    if (member.fear > 0) wantedSpeed = flee(group, member);
    else if (feedingSpeed === cruise) wantedSpeed = inspect(group, member);
    // Fleeing and feeding fish climb and dive steeply.
    const feeding = member.fear > 0 || feedingSpeed > cruise;

    member.gaze = nextGaze(member.gaze, turnIntent(member.velocity, force), GAZE_SACCADE_THRESHOLD);

    const speed = member.velocity.length();
    term.copy(member.velocity).multiplyScalar(((wantedSpeed - speed) / speed) * SPEED_RESPONSE);
    force.multiplyScalar(cruise).add(term);

    previousVelocity.copy(member.velocity);
    member.velocity.addScaledVector(force, deltaSeconds);
    const maxVertical =
      member.velocity.length() * (feeding ? FEEDING_VERTICAL_RATIO : MAX_VERTICAL_RATIO);
    member.velocity.y = clamp(member.velocity.y, -maxVertical, maxVertical);
    const clamped = clamp(member.velocity.length(), cruise * MIN_SPEED_RATIO, species.speed.max);
    member.velocity.setLength(clamped);

    member.bend = easeToward(
      member.bend,
      turnBend(previousVelocity, member.velocity, deltaSeconds, member.length),
      BEND_RESPONSE_SECONDS,
      deltaSeconds,
    );
    member.effort = easeToward(
      member.effort,
      tailEffort(previousVelocity, member.velocity, deltaSeconds, cruise),
      EFFORT_RESPONSE_SECONDS,
      deltaSeconds,
    );
  };

  const move = (member: Fish, deltaSeconds: number): void => {
    current.sample(member.position, timeSeconds, drift);
    member.position
      .addScaledVector(member.velocity, deltaSeconds)
      .addScaledVector(drift, deltaSeconds);
    // Steering keeps fish clear of the rock; this stops the rare one that
    // still dives into it (fast fish, steep faces) from passing through.
    const floor =
      seabed(member.position.x, member.position.z) + member.length * SEABED_MIN_GAP_BODY_LENGTHS;
    if (member.position.y < floor) {
      member.position.y = floor;
      member.velocity.y = Math.max(member.velocity.y, 0);
    }
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
    food,
    get timeSeconds() {
      return timeSeconds;
    },
    step(deltaSeconds) {
      let removed = false;
      food.step(deltaSeconds, timeSeconds, current, seabed);
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
    dropFood(x, z) {
      food.drop(x, z);
    },
    setFinger(point) {
      fingerPresent = point !== undefined;
      if (point !== undefined) finger.copy(point);
    },
    tap(point) {
      tapPoint.copy(point);
      for (const group of groups.values()) {
        const radius = STARTLE_RADIUS * lerp(MIN_STARTLE_SHARE, 1, group.species.behavior.shyness);
        for (const member of group.members) {
          if (member.position.distanceTo(point) < radius) member.fear = 1;
        }
      }
    },
    setSeabed(next) {
      seabed = next;
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
