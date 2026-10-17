import { Box3, Vector3 } from "three";
import { clamp, lerp, smoothstep } from "../core/math";
import { createRng, hashToUnit, type Rng } from "../core/rng";
import type { Scene, Species, SpeciesCatalog } from "../scene/schema";
import type { SwimSpec } from "../scene/swimming";
import {
  activityOf,
  createActivityChooser,
  createActivityState,
  createSwimState,
  restfulness,
  doesMoreThanWander,
  evenRests,
  nestlePoint,
  settleDown,
  swimStyleOf,
  type ActivityState,
  type SwimContext,
  type SwimState,
} from "./behaviors";
import { nextGaze, turnIntent } from "./gaze";
import { createGesture, isScribbling, spinOf, trackFinger, type Gesture } from "./gesture";
import { createCrowd } from "./crowd";
import { createCurrentField, type CurrentField } from "./current";
import { createFood, type Food } from "./food";
import {
  combineFields,
  createObstacleField,
  openYaw,
  type Obstacle,
  type ObstacleField,
} from "./obstacles";
import { createPlaceFinder, topOf, type Place } from "./places";
import { beamOffset, beamRadius, torchStrength } from "./torch";
import {
  applyPlay,
  breakSpells,
  createPlay,
  isEnchanted,
  nextRoll,
  updatePlay,
  wriggleBend,
  type PlayState,
} from "./play";
import { easeToward, tailEffort, turnBend, turnWithInertia } from "./posture";
import {
  addAlignment,
  addCohesion,
  addContainment,
  addHeading,
  addObstacleAvoidance,
  addSeabedClearance,
  addSeabedLookAhead,
  addSeparation,
  type SeabedHeight,
} from "./steering";
import { habitatBox } from "./tank";
import { createVisitors, type VisitorState } from "./visitors";

/** Default cap on fish alive at once, including those entering and leaving. */
export const TOTAL_FISH_LIMIT = 300;

/** Distance beyond the side walls where new fish appear, in meters. */
const SPAWN_OFFSET = 1;
/** Distance beyond the side walls where leaving fish are removed, in meters. */
const EXIT_OFFSET = 1.5;
/** Soft-wall thickness, in meters (capped for thin habitats). */
const CONTAINMENT_MARGIN = 0.5;
/**
 * A fish whose home is a place in the scenery may leave its habitat to stay
 * there: its soft walls widen to this many body lengths around the home.
 */
const ANCHOR_REACH_BODY_LENGTHS = 4;
const NO_PLACES: readonly Place[] = [];
const NO_OBSTACLES: readonly Obstacle[] = [];
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
/**
 * At a place (pecking at the sand, resting, hiding) a fish keeps only this
 * many body lengths off the seabed, and its hard limit shrinks to
 * CLOSE_IN_SEABED_GAP: its belly may nearly touch, its mouth reach.
 */
const CLOSE_IN_SEABED_BODY_LENGTHS = 0.5;
const CLOSE_IN_SEABED_GAP = 0.3;
// Obstacles (sim/obstacles). Fish look ahead along their course for the
// time it takes to swim LOOK_AHEAD_SECONDS (at least LOOK_AHEAD_BODY_LENGTHS)
// and keep OBSTACLE_BODY_LENGTHS (at least OBSTACLE_MIN_CLEARANCE) off the
// rocks. A fish at a place (pecking, resting, hiding) only keeps
// CLOSE_IN_GAPS of its hard gap and does not look ahead, so it can come
// right up to it. The hard gap stops the rare one that still dives in.
const OBSTACLE_WEIGHT = 5;
const LOOK_AHEAD_SECONDS = 0.6;
const LOOK_AHEAD_BODY_LENGTHS = 1.5;
const OBSTACLE_BODY_LENGTHS = 1;
const OBSTACLE_MIN_CLEARANCE = 0.06;
const OBSTACLE_GAP_BODY_LENGTHS = 0.4;
const CLOSE_IN_GAPS = 1.5;
/**
 * A fish that spent UNSTICK_TOUCHING of the last UNSTICK_CHECK_SECONDS
 * touching the rocks and got no more than UNSTICK_BODY_LENGTHS away is caught
 * in a pocket: for ESCAPE_SECONDS it heads for the most open way, looked for
 * ESCAPE_BODY_LENGTHS (at least ESCAPE_MIN_DISTANCE) around it, whatever its
 * style wants.
 */
const UNSTICK_CHECK_SECONDS = 2;
const UNSTICK_TOUCHING = 0.8;
const UNSTICK_BODY_LENGTHS = 1;
const ESCAPE_SECONDS = 2;
const ESCAPE_BODY_LENGTHS = 2;
const ESCAPE_MIN_DISTANCE = 0.15;
/** A place is open when this far above its top lies outside every obstacle, m. */
const OPEN_PROBE = 0.03;
/** A fish counts as at its place within this many body lengths of it. */
const CLOSE_IN_BODY_LENGTHS = 4;
/** At a place, the hard gap shrinks to this share: the body may touch, the mouth reach. */
const CLOSE_IN_GAP_SHARE = 0.6;
/** Push away from fish of other species in a fish's personal space (sim/crowd). */
const CROWD_WEIGHT = 2;
/** Pull towards the heading the swimming style wants; it only turns the fish. */
const HEADING_WEIGHT = 0.8;
/** Pull towards the height the swimming style wants, at full strength this far away, m. */
const HEIGHT_WEIGHT = 0.5;
const HEIGHT_PULL_RANGE = 0.3;
/**
 * A fish diving steeply (pecking, hiding) aims at its height once within
 * HEIGHT_PULL_RANGE of it: it climbs or dives at the speed that would get it
 * there in STEEP_HEIGHT_SECONDS (as steep as it may), matching that speed
 * within STEEP_RESPONSE_SECONDS. The gentle pull alone would leave a small
 * fish hovering above a spot, and a stiff one would bob it about.
 */
const STEEP_HEIGHT_SECONDS = 0.4;
const STEEP_RESPONSE_SECONDS = 0.2;
/** Speed response when food, a finger or a fright sets the pace, 1/s. */
const SPEED_RESPONSE = 1.5;
const TRANSIT_PULL = 2;

/** Separation radius in body lengths. */
const SEPARATION_BODY_LENGTHS = 2.5;
/**
 * A school closes up when one of them is frightened, and loosens again as
 * the fright fades: at full alarm cohesion is ALARMED_COHESION times its
 * weight, alignment ALARMED_ALIGNMENT times, and neighbours accept
 * ALARMED_SPACING of the usual separation.
 */
const ALARMED_COHESION = 3;
const ALARMED_ALIGNMENT = 1.6;
const ALARMED_SPACING = 0.6;
/** Neighbour radius for schooling, in body lengths. */
const SCHOOL_BODY_LENGTHS = 12;
/** Fish never slow below this fraction of cruise speed, so they always have a heading. */
const MIN_SPEED_RATIO = 0.1;
/** Fish swim mostly horizontally: vertical velocity is capped to this fraction of speed. */
const MAX_VERTICAL_RATIO = 0.35;
/** Fleeing fish dart away mostly level: their vertical escape is scaled by this. */
const FLEE_VERTICAL_RATIO = 0.5;
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
// Playing with the viewer (sim/play): circles drawn within HYPNOSIS_RADIUS of
// a fish's line of sight hypnotize it; scribbles right over its body tickle it.
const HYPNOSIS_RADIUS = 0.6;
const ON_BODY_LENGTHS = 0.7;
const ON_BODY_MIN_RADIUS = 0.05;
// Shelters. A startled fish that hides looks for a shelter within
// HIDE_BODY_LENGTHS (at least HIDE_MIN_RADIUS), and stays hidden for
// HIDE_SECONDS from the fright; a host fish hides in its anemone.
const HIDE_BODY_LENGTHS = 15;
const HIDE_MIN_RADIUS = 1;
const HIDE_SECONDS = 6;
/** Hidden fish lurk at this share of cruise speed, and slow down within this many body lengths. */
const LURK_SPEED = 0.1;
const HIDE_ARRIVAL_BODY_LENGTHS = 2;
/** Keeps the hiding draw independent of the curiosity draw for the same fish. */
const HIDING_SALT = 0x5bd1e995;
const SHELTER: Readonly<Record<string, number>> = { shelter: 1 };
// The torch (sim/torch). Fish that love light feel the beam from TORCH_REACH
// away and mill about slowly in it; shy ones flee it from SHY_MARGIN times
// its radius, and those that hide hide for TORCH_HIDE_SECONDS.
const TORCH_REACH = 3;
const TORCH_WEIGHT = 2.5;
const GATHER_SPEED = 0.5;
const SHY_MARGIN = 1.5;
const TORCH_HIDE_SECONDS = 4;

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
  /** What the species' swimming style wants right now; see sim/behaviors. */
  readonly swim: SwimState;
  /** What the fish is doing (wandering, pecking…); see sim/behaviors. */
  readonly activity: ActivityState;
  /** Hypnosis, dizziness and tickling by the viewer; see sim/play. */
  readonly play: PlayState;
  /** Roll about the body's length, radians: 0 upright, ±π belly up. */
  roll: number;
  /** Yaw rate, rad/s: a body gets into and out of its turns gradually (sim/posture). */
  turnRate: number;
  /** Seconds it still stays hidden after a fright, 0 when it is not hiding. */
  hiding: number;
  /** Where it hides, while `hiding`. */
  readonly refuge: Vector3;
  /** How large its shelter is, m: within that of `refuge` it is in it. */
  refugeSize: number;
  /** Notices a fish caught in a pocket of the rocks and leads it out. */
  readonly unstick: Unstick;
  /** -1 or 1: which side wall the fish is travelling through when entering or leaving. */
  side: number;
}

export interface Unstick {
  /** Where the fish was at the last check. */
  readonly checkpoint: Vector3;
  /** Seconds since the last check. */
  checkSeconds: number;
  /** Of those, the seconds it spent touching the rocks. */
  touchSeconds: number;
  /** Seconds it still heads out along `yaw`, 0 when it is not caught. */
  escapeSeconds: number;
  /** The way out, radians seen from above. */
  yaw: number;
}

/** A fish that has not been caught yet. */
export function createUnstick(): Unstick {
  return { checkpoint: new Vector3(), checkSeconds: 0, touchSeconds: 0, escapeSeconds: 0, yaw: 0 };
}

/** Keeps the visitors' generator apart from the fish's. */
const VISITOR_SEED_OFFSET = 4099;

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
  /** Animals passing far behind the tank (the scene's visitors); see sim/visitors. */
  readonly visitors: readonly VisitorState[];
  /** What the viewer's finger is drawing on the glass; see sim/gesture. */
  readonly gesture: Readonly<Gesture>;
  /** Advances the simulation by one fixed step. */
  step(deltaSeconds: number): void;
  /**
   * Sets the seabed (sand plus rockwork) fish must keep clear of. Called on
   * every step, so it may change, e.g. when the scenery is rebuilt.
   */
  setSeabed(seabed: SeabedHeight): void;
  /**
   * Sets the solid scenery (rocks, corals, wood) fish swim around. Read on
   * every step; a different list means the scenery changed.
   */
  setObstacles(obstacles: () => readonly Obstacle[]): void;
  /**
   * Sets solid rock given as a distance field, e.g. rock built from blocks
   * (sim/blockwork), swum around like the obstacles. Read on every step; a
   * different field means the rock changed.
   */
  setRockField(rock: () => ObstacleField | undefined): void;
  /** Drops a pinch of food at the surface above (x, z), tank coordinates. */
  dropFood(x: number, z: number): void;
  /**
   * Sets the places of the scenery (plants and props with tags) fish may
   * use, e.g. a clownfish's anemone. Read on every step; when it returns a
   * different list, fish that keep to places choose theirs again.
   */
  setPlaces(places: () => readonly Place[]): void;
  /**
   * Where a viewer's finger rests on the glass (tank coordinates), or
   * undefined when nobody is touching it. Curious fish come to look, and
   * the finger's gestures play with the fish it points at (see sim/play).
   * `sight` is the direction of the viewer's line of sight through the
   * finger; straight into the tank when not given.
   */
  setFinger(point: Vector3 | undefined, sight?: Vector3): void;
  /**
   * Realistic mode: fish keep the hours of their species (resting in theirs,
   * see `setDaylight`) and the viewer casts no spells (sim/play). Off, they
   * never rest and the spells are on.
   */
  setRealistic(realistic: boolean): void;
  /**
   * Switches the torch: while on, the finger is a torch shining into the
   * tank along the line of sight, instead of a finger fish come to look at
   * or play with.
   */
  setTorch(on: boolean): void;
  /** How much of a day it is, 0 (night) .. 1 (full day); read on every step. */
  setDaylight(daylight: () => number): void;
  /** A tap on the glass at `point`: nearby fish dart away. */
  tap(point: Vector3): void;
  /** Requests a new population for a species; fish swim in or out gradually. */
  setCount(speciesId: string, count: number): void;
  targetCount(speciesId: string): number;
}

interface Group {
  readonly species: Species;
  readonly habitat: Box3;
  /** The habitat less its soft walls: where the swimming style roams. */
  readonly room: Box3;
  /** The habitat widened by FORAGE_MARGIN: where this species goes for food. */
  readonly forage: Box3;
  /**
   * Where this species goes for places that interest it: its depth bands
   * (widened like `forage`), all the way down to the floor.
   */
  readonly visit: Box3;
  /** Whether the species does anything but wander in its active hours. */
  readonly restless: boolean;
  /** Whether it ever rests (in realistic mode). */
  readonly sleeper: boolean;
  /** Entering and swimming fish. */
  readonly members: Fish[];
  /** Positions of `members`, kept in sync so steering needs no per-frame arrays. */
  readonly positions: Vector3[];
  readonly leaving: Fish[];
  target: number;
  /** 0 calm .. 1: the fear of its most frightened member, which the whole school feels. */
  alarm: number;
}

/** Whether a style keeps a fish at a place of the scenery. */
function keepsToPlaces(spec: SwimSpec): boolean {
  return "home" in spec && spec.home !== undefined;
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
  let places: () => readonly Place[] = () => NO_PLACES;
  let obstacles: () => readonly Obstacle[] = () => NO_OBSTACLES;
  let knownObstacles: readonly Obstacle[] = NO_OBSTACLES;
  let rockField: () => ObstacleField | undefined = () => undefined;
  let knownRock: ObstacleField | undefined;
  let obstacleField = createObstacleField(NO_OBSTACLES);
  const crowd = createCrowd({
    minX: -halfWidth - EXIT_OFFSET,
    maxX: halfWidth + EXIT_OFFSET,
    minZ: -scene.tank.depth,
    maxZ: 0,
  });
  let realistic = false;
  let torchOn = false;
  let daylightNow: () => number = () => 1;
  let daylight = 1;
  let knownPlaces = NO_PLACES;
  /** The places whose top is clear of every obstacle: the only ones fish can get to. */
  let openPlaces: readonly Place[] = NO_PLACES;
  let timeSeconds = 0;
  // Shares the simulation's generator: it only draws numbers when food is
  // dropped, so a tank nobody feeds plays exactly as before.
  const food = createFood({ tank: scene.tank, rng });

  const marginFor = (box: Box3): number =>
    Math.min(CONTAINMENT_MARGIN, (box.max.y - box.min.y) / 3, (box.max.z - box.min.z) / 3);

  for (const species of catalog.species) {
    const habitat = habitatBox(scene.tank, species);
    const forage = habitat.clone().expandByScalar(FORAGE_MARGIN);
    const visit = forage.clone();
    visit.min.y = Math.min(visit.min.y, 0);
    groups.set(species.id, {
      species,
      habitat,
      room: habitat.clone().expandByScalar(-marginFor(habitat)),
      forage,
      visit,
      restless: doesMoreThanWander(species.activities),
      sleeper: evenRests(species.activities, species.behavior.active),
      members: [],
      positions: [],
      leaving: [],
      target: 0,
      alarm: 0,
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

  // What swimming styles see; refilled for each fish, so it is never reallocated.
  const swimContext: { -readonly [Key in keyof SwimContext]: SwimContext[Key] } = {
    position: new Vector3(),
    velocity: new Vector3(),
    room: new Box3(),
    length: 0,
    cruise: 0,
    rng,
    places: createPlaceFinder(
      () => openPlaces,
      (x, z) => seabed(x, z),
    ),
  };
  const arrival = new Vector3();
  const chooser = createActivityChooser();

  /** What styles and activities see for this fish, standing at `at`. */
  const contextFor = (group: Group, member: Fish, at: Vector3 = member.position): SwimContext => {
    swimContext.position = at;
    swimContext.velocity = member.velocity;
    swimContext.room = group.room;
    swimContext.length = member.length;
    swimContext.cruise = group.species.speed.cruise;
    return swimContext;
  };

  /**
   * Whether a group does anything but wander right now: activities in its
   * active hours, or rest in realistic mode.
   */
  const hasActivities = (group: Group): boolean => group.restless || (realistic && group.sleeper);

  /** Starts the species' swimming style for a fish now free in the tank, wandering. */
  const startSwimming = (group: Group, member: Fish, at: Vector3): void => {
    contextFor(group, member, at);
    swimStyleOf(group.species.swim).start(member.swim, group.species.swim, swimContext);
    if (!hasActivities(group)) return;
    chooser.wander(member.activity, member.swim, group.species.activities, swimContext);
    // Partway through, so fish that start together do not all choose at once.
    member.activity.timer *= rng.next();
  };

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
    const velocity = new Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(
      species.speed.cruise,
    );
    const member: Fish = {
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
      swim: createSwimState(angle),
      activity: createActivityState(),
      play: createPlay(),
      roll: 0,
      turnRate: 0,
      hiding: 0,
      refuge: new Vector3(),
      refugeSize: 0,
      unstick: createUnstick(),
      side,
    };
    if (!entering) startSwimming(group, member, position);
    return member;
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
      // It drops whatever it was doing on its way out.
      surplus.activity.id = "wander";
      settleDown(surplus.swim);
      surplus.side = surplus.position.x >= 0 ? 1 : -1;
      group.leaving.push(surplus);
    }
  };

  // Initial population: already swimming inside the tank.
  for (const entry of scene.fauna) {
    const group = groupOf(entry.species);
    // Saved counts may predate a species' limit.
    group.target = Math.min(entry.count, group.species.maxCount);
    while (group.members.length < group.target && fish.length < fishLimit) {
      const member = createFish(group, false);
      fish.push(member);
      addMember(group, member);
    }
  }

  // Scratch vectors reused every step: no allocations in the hot loop.
  const force = new Vector3();
  const term = new Vector3();
  const drift = new Vector3();
  const surfaceNormal = new Vector3();
  const probe = new Vector3();
  const previousVelocity = new Vector3();
  const mouthPosition = new Vector3();
  const finger = new Vector3();
  let fingerPresent = false;
  /** Direction of the viewer's line of sight through the finger. */
  const sight = new Vector3(0, 0, -1);
  const gesture = createGesture();
  const playInput = { spin: 0, scribbling: false };
  const offset = new Vector3();
  const tapPoint = new Vector3();
  const inspectSpot = new Vector3();
  const walls = new Box3();
  const reach = new Vector3();

  /** Darts away from the last tap. Returns the speed the fish wants. */
  const flee = (group: Group, member: Fish): number => {
    const { cruise, max } = group.species.speed;
    if (member.hiding > 0) {
      // Runs for its shelter, slowing down as it gets there.
      term.subVectors(member.refuge, member.position);
      const distance = term.length();
      if (distance > 0) force.addScaledVector(term.normalize(), FLEE_WEIGHT * member.fear);
      const arrival = member.length * HIDE_ARRIVAL_BODY_LENGTHS;
      return lerp(cruise, max, member.fear) * clamp(distance / arrival, LURK_SPEED, 1);
    }
    term.subVectors(member.position, tapPoint);
    term.y *= FLEE_VERTICAL_RATIO;
    if (term.lengthSq() > 0) force.addScaledVector(term.normalize(), FLEE_WEIGHT * member.fear);
    return lerp(cruise, max, member.fear);
  };

  /**
   * Reacts to the torch, if it is on and the species cares: gathers in the
   * beam or flees it. Returns the speed the fish wants, or undefined.
   */
  const shine = (group: Group, member: Fish): number | undefined => {
    const { torch: liking } = group.species.behavior;
    if (!torchOn || !fingerPresent || liking === 0 || member.state !== "swimming") {
      return undefined;
    }
    const along = beamOffset(member.position, finger, sight, offset);
    if (along < 0) return undefined;
    const distance = offset.length();
    const radius = beamRadius(along);
    const strength = torchStrength(daylight) * Math.abs(liking);
    const { cruise, max } = group.species.speed;
    if (liking > 0) {
      if (distance > TORCH_REACH) return undefined;
      // Towards the beam's axis; in the beam they mill about slowly.
      if (distance > 0) force.addScaledVector(offset, (-TORCH_WEIGHT * strength) / distance);
      return distance < radius ? cruise * GATHER_SPEED : cruise;
    }
    if (distance > radius * SHY_MARGIN) return undefined;
    if (distance > 0) force.addScaledVector(offset, (TORCH_WEIGHT * strength) / distance);
    if (member.hiding === 0 && seekRefuge(group, member)) member.hiding = TORCH_HIDE_SECONDS;
    return lerp(cruise, max, strength);
  };

  /**
   * On a fright: whether this fish hides, and where. A host fish hides in its
   * anemone; one of the species' hiding individuals in the nearest shelter.
   */
  const seekRefuge = (group: Group, member: Fish): boolean => {
    if (member.swim.anchored) {
      nestlePoint(member.swim, member.length, member.refuge);
      member.refugeSize = 0;
      return true;
    }
    if (hashToUnit(member.id + HIDING_SALT) >= group.species.behavior.hiding) return false;
    const radius = Math.max(member.length * HIDE_BODY_LENGTHS, HIDE_MIN_RADIUS);
    const { position } = member;
    const size = swimContext.places.pick(
      SHELTER,
      position,
      radius,
      group.visit,
      rng,
      member.refuge,
    );
    if (size < 0) return false;
    // Into the shelter, halfway down.
    member.refuge.y -= size / 2;
    member.refugeSize = size;
    return true;
  };

  /** A hidden fish lurks in its shelter until it feels safe again. */
  const lurk = (member: Fish, deltaSeconds: number): void => {
    const { swim, refuge } = member;
    member.hiding = Math.max(member.hiding - deltaSeconds, 0);
    const distance = member.position.distanceTo(refuge);
    swim.yaw = Math.atan2(refuge.z - member.position.z, refuge.x - member.position.x);
    swim.height = refuge.y;
    swim.speed = clamp(distance / (member.length * HIDE_ARRIVAL_BODY_LENGTHS), LURK_SPEED, 1);
    swim.steep = true;
  };

  /**
   * Comes to look at the finger on the glass if this individual is one of the
   * curious ones and the finger is close enough. Returns the speed the fish
   * wants, slower as it arrives so it lingers, or undefined when it does not
   * come.
   */
  const inspectFinger = (group: Group, member: Fish): number | undefined => {
    const { species, forage: reach } = group;
    const cruise = species.speed.cruise;
    if (
      !fingerPresent ||
      member.state !== "swimming" ||
      hashToUnit(member.id) >= species.behavior.curiosity ||
      member.position.distanceTo(finger) > CURIOSITY_RADIUS
    ) {
      return undefined;
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
   * wants (faster when hungry), or undefined when it is not feeding.
   */
  const forage = (group: Group, member: Fish, deltaSeconds: number): number | undefined => {
    const { species } = group;
    const cruise = species.speed.cruise;
    member.satiety = Math.max(member.satiety - deltaSeconds / SATIETY_DECAY_SECONDS, 0);
    const hunger = species.behavior.appetite * (1 - member.satiety);
    const flake =
      member.state === "swimming" && member.satiety < SATED && member.fear === 0
        ? food.nearest(member.position, FOOD_SENSE_RADIUS, group.forage)
        : undefined;
    let mouthTarget = 0;
    let speed: number | undefined;
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
    // An activity may want the mouth open too (pecking).
    mouthTarget = Math.max(mouthTarget, member.swim.mouth);
    member.mouth =
      mouthTarget === 0 && member.mouth < MOUTH_CLOSED
        ? 0
        : easeToward(member.mouth, mouthTarget, MOUTH_RESPONSE_SECONDS, deltaSeconds);
    return speed;
  };

  /**
   * What the viewer's finger does to a fish: circles drawn near its line of
   * sight hypnotize it, scribbles right over its body tickle it.
   */
  const playWithViewer = (member: Fish, deltaSeconds: number): void => {
    playInput.spin = 0;
    playInput.scribbling = false;
    if (fingerPresent && !realistic && !torchOn) {
      offset.subVectors(member.position, finger);
      const along = offset.dot(sight);
      if (along > 0) {
        const across = offset.addScaledVector(sight, -along).length();
        const body = Math.max(member.length * ON_BODY_LENGTHS, ON_BODY_MIN_RADIUS);
        if (across < HYPNOSIS_RADIUS) playInput.spin = spinOf(gesture);
        playInput.scribbling = across < body && isScribbling(gesture);
      }
    }
    updatePlay(member.play, playInput, deltaSeconds);
  };

  /** Where a hypnotized fish's eyes turn: towards the finger, -1 (right) .. 1 (left). */
  const gazeAtFinger = (member: Fish): number => {
    const { velocity, position } = member;
    const heading = Math.hypot(velocity.x, velocity.z);
    const towardsX = finger.x - position.x;
    const towardsZ = finger.z - position.z;
    const distance = Math.hypot(towardsX, towardsZ);
    if (heading === 0 || distance === 0) return member.gaze;
    // Positive to the left of the heading, like gaze and bend.
    const side = (velocity.z * towardsX - velocity.x * towardsZ) / (heading * distance);
    return clamp(side, -1, 1);
  };

  /**
   * Whether the top of a place is clear of the obstacles, its own surface
   * aside: a plant grown under driftwood is out of reach, inside its shape.
   */
  const isOpen = (place: Place): boolean => {
    probe.set(place.x, topOf(place, seabed) + OPEN_PROBE, place.z);
    return obstacleField.distance(probe, surfaceNormal, OPEN_PROBE) > 0;
  };

  /**
   * Whether a fish is at its place (pecking, resting, hiding…), within
   * CLOSE_IN_BODY_LENGTHS of it, where it may come right up to the rock. On
   * the way there it still looks ahead and swims around what is in between.
   */
  const closeIn = (member: Fish): boolean => {
    const { activity, length, position } = member;
    const reach = length * CLOSE_IN_BODY_LENGTHS;
    if (member.hiding > 0) {
      return position.distanceTo(member.refuge) < Math.max(reach, member.refugeSize);
    }
    return activityOf(activity.id).atPlace && position.distanceTo(activity.target) < reach;
  };

  /**
   * Whether a hiding fish is close enough to slip into its shelter. Shelters
   * are porous (branches, roots, the space under a table coral), so a fish
   * that hides there goes in, though their shapes stop fish passing by.
   */
  const slipsIn = (member: Fish): boolean => member.hiding > 0 && closeIn(member);

  /** Checks now and then whether a fish touching the rocks is caught in a pocket. */
  const watchForPockets = (member: Fish, keepOff: number, deltaSeconds: number): void => {
    const { unstick, position, length } = member;
    unstick.checkSeconds += deltaSeconds;
    if (obstacleField.distance(position, surfaceNormal, keepOff) < keepOff) {
      unstick.touchSeconds += deltaSeconds;
    }
    if (unstick.checkSeconds < UNSTICK_CHECK_SECONDS) return;
    const stalled = unstick.checkpoint.distanceTo(position) < length * UNSTICK_BODY_LENGTHS;
    const touching = unstick.touchSeconds > unstick.checkSeconds * UNSTICK_TOUCHING;
    if (stalled && touching && member.species.swim.style !== "hover") {
      const around = Math.max(length * ESCAPE_BODY_LENGTHS, ESCAPE_MIN_DISTANCE);
      unstick.yaw = openYaw(obstacleField, position, around);
      unstick.escapeSeconds = ESCAPE_SECONDS;
    }
    unstick.checkpoint.copy(position);
    unstick.checkSeconds = 0;
    unstick.touchSeconds = 0;
  };

  const steer = (group: Group, member: Fish, deltaSeconds: number): void => {
    const { species, habitat } = group;
    const cruise = species.speed.cruise;
    force.set(0, 0, 0);

    term.set(0, 0, 0);
    const spacing = member.length * SEPARATION_BODY_LENGTHS * lerp(1, ALARMED_SPACING, group.alarm);
    addSeparation(member.position, group.positions, spacing, term);
    force.addScaledVector(term, SEPARATION_WEIGHT);

    term.set(0, 0, 0);
    crowd.addPersonalSpace(member, term);
    force.addScaledVector(term, CROWD_WEIGHT);

    if (species.schooling > 0 && member.state === "swimming") {
      const radius = member.length * SCHOOL_BODY_LENGTHS;
      term.set(0, 0, 0);
      addCohesion(member.position, group.positions, radius, term);
      const cohesion = lerp(1, ALARMED_COHESION, group.alarm);
      force.addScaledVector(term, COHESION_WEIGHT * species.schooling * cohesion);
      term.set(0, 0, 0);
      addAlignment(member.position, member.velocity, group.members, radius, term);
      const alignment = lerp(1, ALARMED_ALIGNMENT, group.alarm);
      force.addScaledVector(term, (ALIGNMENT_WEIGHT * species.schooling * alignment) / cruise);
    }

    const margin = marginFor(habitat);
    walls.copy(habitat);
    reach.setScalar(member.length * ANCHOR_REACH_BODY_LENGTHS + margin);
    if (member.swim.anchored) {
      walls.expandByPoint(term.copy(member.swim.home).sub(reach));
      walls.expandByPoint(term.copy(member.swim.home).add(reach));
    }
    const { activity } = member;
    if (member.hiding > 0) {
      walls.expandByPoint(term.copy(member.refuge).sub(reach));
      walls.expandByPoint(term.copy(member.refuge).add(reach));
    }
    if (activityOf(activity.id).atPlace && activity.targetSize >= 0) {
      walls.expandByPoint(term.copy(activity.target).sub(reach));
      walls.expandByPoint(term.copy(activity.target).add(reach));
    }
    term.set(0, 0, 0);
    addContainment(member.position, walls, margin, term, {
      ignoreX: member.state !== "swimming",
    });
    force.addScaledVector(term, CONTAINMENT_WEIGHT);

    term.set(0, 0, 0);
    const clearance = closeIn(member)
      ? member.length * CLOSE_IN_SEABED_BODY_LENGTHS
      : Math.max(member.length * SEABED_BODY_LENGTHS, SEABED_MIN_CLEARANCE);
    addSeabedClearance(member.position, seabed, clearance, term);
    force.addScaledVector(term, SEABED_WEIGHT);

    term.set(0, 0, 0);
    const atPlace = closeIn(member);
    const gap = member.length * OBSTACLE_GAP_BODY_LENGTHS * (atPlace ? CLOSE_IN_GAP_SHARE : 1);
    const lookAhead = atPlace
      ? 0
      : Math.max(
          member.velocity.length() * LOOK_AHEAD_SECONDS,
          member.length * LOOK_AHEAD_BODY_LENGTHS,
        );
    const keepOff = atPlace
      ? gap * CLOSE_IN_GAPS
      : Math.max(member.length * OBSTACLE_BODY_LENGTHS, OBSTACLE_MIN_CLEARANCE);
    // Heading out of a pocket, only the hard gap keeps it off the rocks: their
    // push would keep turning it back in.
    if (!slipsIn(member) && member.unstick.escapeSeconds === 0) {
      addObstacleAvoidance(
        member.position,
        member.velocity,
        obstacleField,
        lookAhead,
        keepOff,
        term,
      );
      force.addScaledVector(term, OBSTACLE_WEIGHT);
    }
    if (!atPlace) watchForPockets(member, keepOff, deltaSeconds);
    // Rock faces of the rockwork, seen coming like the props.
    term.set(0, 0, 0);
    addSeabedLookAhead(member.position, member.velocity, seabed, lookAhead, clearance, term);
    force.addScaledVector(term, SEABED_WEIGHT);

    const { swim } = member;
    if (member.state === "swimming") {
      contextFor(group, member);
      swimStyleOf(species.swim).step(swim, species.swim, swimContext, deltaSeconds);
      const params = species.activities[activity.id];
      if (
        hasActivities(group) &&
        !activityOf(activity.id).step(activity, swim, params, swimContext, deltaSeconds)
      ) {
        const rest = realistic ? restfulness(species.behavior.active, daylight) : 0;
        chooser.choose(activity, swim, species.activities, swimContext, group.visit, rest);
      }
      if (member.hiding > 0) {
        if (activity.id !== "wander") {
          chooser.wander(activity, swim, species.activities, swimContext);
        }
        lurk(member, deltaSeconds);
      }
      playWithViewer(member, deltaSeconds);
      if (isEnchanted(member.play)) {
        if (activity.id !== "wander") {
          chooser.wander(activity, swim, species.activities, swimContext);
        }
        const heading = Math.atan2(member.velocity.z, member.velocity.x);
        applyPlay(member.play, swim, heading, member.position.y, member.length);
      }
      const { unstick } = member;
      if (unstick.escapeSeconds > 0) {
        unstick.escapeSeconds = Math.max(unstick.escapeSeconds - deltaSeconds, 0);
        swim.yaw = unstick.yaw;
      }
      term.set(0, 0, 0);
      addHeading(member.velocity, swim.yaw, term);
      force.addScaledVector(term, HEADING_WEIGHT);
      const rise = swim.height - member.position.y;
      if (swim.steep && Math.abs(rise) < HEIGHT_PULL_RANGE) {
        const steepest = member.velocity.length() * FEEDING_VERTICAL_RATIO;
        const wanted = clamp(rise / STEEP_HEIGHT_SECONDS, -steepest, steepest);
        force.y += (wanted - member.velocity.y) / STEEP_RESPONSE_SECONDS / cruise;
      } else {
        force.y += HEIGHT_WEIGHT * clamp(rise / HEIGHT_PULL_RANGE, -1, 1);
      }
    } else {
      // Entering fish head inwards (away from their side), leaving fish head out.
      const direction = member.state === "entering" ? -member.side : member.side;
      force.x += direction * TRANSIT_PULL;
    }

    // Reactions in order of urgency: fear, then food, then curiosity. They
    // set the pace instead of the swimming style while they last.
    member.fear = Math.max(member.fear - deltaSeconds / FEAR_SECONDS, 0);
    const feedingSpeed = forage(group, member, deltaSeconds);
    // A spell of the viewer's (hypnosis, tickling) beats curiosity.
    // With the torch on, the finger is a torch: no curiosity, only light.
    const curiousSpeed = torchOn
      ? shine(group, member)
      : isEnchanted(member.play)
        ? undefined
        : inspectFinger(group, member);
    const reactionSpeed = member.fear > 0 ? flee(group, member) : (feedingSpeed ?? curiousSpeed);
    // Fright, food or a finger on the glass call off what the fish was doing.
    if (reactionSpeed !== undefined && activity.id !== "wander") {
      chooser.wander(activity, swim, species.activities, swimContext);
    }
    // Fleeing, feeding and pecking fish climb and dive steeply.
    const steep = member.fear > 0 || feedingSpeed !== undefined || swim.steep;
    const styled = reactionSpeed === undefined && member.state === "swimming";
    const wantedSpeed = reactionSpeed ?? Math.min(cruise * swim.speed, species.speed.max);
    const response = styled ? swim.response : SPEED_RESPONSE;
    const thrust = styled ? swim.thrust : 1;

    member.gaze = nextGaze(member.gaze, turnIntent(member.velocity, force), GAZE_SACCADE_THRESHOLD);
    if (member.play.hypnosis > 0 && fingerPresent) member.gaze = gazeAtFinger(member);

    const speed = member.velocity.length();
    term.copy(member.velocity).multiplyScalar(((wantedSpeed - speed) / speed) * response);
    force.multiplyScalar(cruise).add(term);

    previousVelocity.copy(member.velocity);
    member.velocity.addScaledVector(force, deltaSeconds);
    const maxVertical =
      member.velocity.length() * (steep ? FEEDING_VERTICAL_RATIO : MAX_VERTICAL_RATIO);
    member.velocity.y = clamp(member.velocity.y, -maxVertical, maxVertical);
    const clamped = clamp(member.velocity.length(), cruise * MIN_SPEED_RATIO, species.speed.max);
    member.velocity.setLength(clamped);
    // A tickled fish twists like a frightened one.
    const urgency = member.play.tickled > 0 ? 1 : member.fear;
    const agility = cruise / member.length;
    turnWithInertia(previousVelocity, member.velocity, member, agility, urgency, deltaSeconds);

    member.bend = easeToward(
      member.bend,
      turnBend(previousVelocity, member.velocity, deltaSeconds, member.length),
      BEND_RESPONSE_SECONDS,
      deltaSeconds,
    );
    member.effort = easeToward(
      member.effort,
      tailEffort(previousVelocity, member.velocity, deltaSeconds, cruise, thrust),
      EFFORT_RESPONSE_SECONDS,
      deltaSeconds,
    );
    member.bend = wriggleBend(member.play) ?? member.bend;
    member.roll = nextRoll(member.play, member.roll, deltaSeconds);
  };

  const move = (member: Fish, deltaSeconds: number): void => {
    current.sample(member.position, timeSeconds, drift);
    member.position
      .addScaledVector(member.velocity, deltaSeconds)
      .addScaledVector(drift, deltaSeconds);
    // Steering keeps fish clear of the rock; this stops the rare one that
    // still dives into it (fast fish, steep faces) from passing through.
    const floor =
      seabed(member.position.x, member.position.z) +
      member.length * (closeIn(member) ? CLOSE_IN_SEABED_GAP : SEABED_MIN_GAP_BODY_LENGTHS);
    if (member.position.y < floor) {
      member.position.y = floor;
      member.velocity.y = Math.max(member.velocity.y, 0);
    }
    // Likewise for the rocks: slide it out along the surface. Its velocity is
    // left to the steering, which turns it within what its body can.
    const gap =
      member.length * OBSTACLE_GAP_BODY_LENGTHS * (closeIn(member) ? CLOSE_IN_GAP_SHARE : 1);
    const inside = slipsIn(member)
      ? Infinity
      : obstacleField.distance(member.position, surfaceNormal, gap);
    if (inside < gap) member.position.addScaledVector(surfaceNormal, gap - inside);
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
        member.swim.yaw = Math.atan2(member.velocity.z, member.velocity.x);
        // Settles somewhere in its habitat rather than right by the wall it
        // came through, or every newcomer would keep station at the sides.
        const { room } = group;
        arrival.set(
          rng.range(room.min.x, room.max.x),
          rng.range(room.min.y, room.max.y),
          rng.range(room.min.z, room.max.z),
        );
        startSwimming(group, member, arrival);
      }
      return false;
    }
    if (member.state === "leaving") {
      member.opacity = clamp(1 - beyond / EXIT_OFFSET, 0, 1);
      return beyond >= EXIT_OFFSET;
    }
    return false;
  };

  // Their own generator: inviting visitors must not change what the fish do.
  const visitors = createVisitors(
    scene.visitors,
    scene.tank,
    createRng(scene.seed + VISITOR_SEED_OFFSET),
  );

  return {
    fish,
    current,
    food,
    get timeSeconds() {
      return timeSeconds;
    },
    visitors: visitors.all,
    gesture,
    step(deltaSeconds) {
      let removed = false;
      for (const group of groups.values()) {
        group.alarm = 0;
        for (const member of group.members) group.alarm = Math.max(group.alarm, member.fear);
      }
      const currentObstacles = obstacles();
      const currentRock = rockField();
      const obstaclesChanged = currentObstacles !== knownObstacles || currentRock !== knownRock;
      if (obstaclesChanged) {
        knownObstacles = currentObstacles;
        knownRock = currentRock;
        const props = createObstacleField(currentObstacles);
        obstacleField = currentRock === undefined ? props : combineFields(props, currentRock);
      }
      const currentPlaces = places();
      if (currentPlaces !== knownPlaces || obstaclesChanged) {
        knownPlaces = currentPlaces;
        openPlaces = currentPlaces.filter(isOpen);
        // The places fish were heading for may be gone: choose again.
        for (const group of groups.values()) {
          for (const member of group.members) {
            if (member.state !== "swimming") continue;
            if (keepsToPlaces(group.species.swim)) startSwimming(group, member, member.position);
            else if (activityOf(member.activity.id).atPlace) {
              const context = contextFor(group, member);
              chooser.wander(member.activity, member.swim, group.species.activities, context);
            }
          }
        }
      }
      food.step(deltaSeconds, timeSeconds, current, seabed, obstacleField);
      trackFinger(gesture, fingerPresent ? finger : undefined, deltaSeconds);
      daylight = daylightNow();
      crowd.sort(fish);
      for (const group of groups.values()) {
        for (const member of group.members) steer(group, member, deltaSeconds);
        for (const member of group.leaving) steer(group, member, deltaSeconds);
      }
      // Before moving, so the seabed and the rocks still have the last word.
      crowd.separate();
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
      visitors.step(deltaSeconds);
      timeSeconds += deltaSeconds;
    },
    dropFood(x, z) {
      food.drop(x, z);
    },
    setFinger(point, towards) {
      fingerPresent = point !== undefined;
      if (towards !== undefined) sight.copy(towards).normalize();
      if (point !== undefined) finger.copy(point);
    },
    tap(point) {
      tapPoint.copy(point);
      for (const group of groups.values()) {
        const radius = STARTLE_RADIUS * lerp(MIN_STARTLE_SHARE, 1, group.species.behavior.shyness);
        for (const member of group.members) {
          if (member.position.distanceTo(point) >= radius) continue;
          member.fear = 1;
          if (member.state === "swimming" && seekRefuge(group, member)) {
            member.hiding = HIDE_SECONDS;
          }
        }
      }
    },
    setSeabed(next) {
      seabed = next;
    },
    setPlaces(next) {
      places = next;
    },
    setObstacles(next) {
      obstacles = next;
    },
    setRockField(next) {
      rockField = next;
    },
    setRealistic(next) {
      realistic = next;
      for (const group of groups.values()) {
        for (const member of group.members) {
          if (realistic) breakSpells(member.play);
          else if (member.activity.id === "rest") {
            // Out of realistic mode nobody sleeps: wake the resting ones.
            const context = contextFor(group, member);
            chooser.wander(member.activity, member.swim, group.species.activities, context);
          }
        }
      }
    },
    setTorch(on) {
      torchOn = on;
    },
    setDaylight(next) {
      daylightNow = next;
    },
    setCount(speciesId, count) {
      const group = groupOf(speciesId);
      group.target = clamp(Math.round(count), 0, group.species.maxCount);
      reconcile(group);
    },
    targetCount(speciesId) {
      return groupOf(speciesId).target;
    },
  };
}
