import { TANK_SIZES, type TankSize } from "../scene/tankMeasures";

/** Scene ids double as file names, so they are restricted. */
const SCENE_ID = /^[a-z0-9-]+$/;
const FEATURE_ID = /^[a-z0-9-]+$/;
const NO_FEATURES = "none";
const HOURS_PER_DAY = 24;

/**
 * Debug tools a URL can switch on: `overlay` is the activity overlay (key
 * A), `shapes` its collision shapes (key C). Listed on /debug.html.
 */
export const DEBUG_TOOLS = ["overlay", "shapes"] as const;
export type DebugTool = (typeof DEBUG_TOOLS)[number];

/** Options read from the page URL, e.g. `?scene=reef&frozen=10&seed=3`. */
export interface LaunchOptions {
  /** Scene id; when absent the saved or default scene opens. */
  readonly scene?: string;
  /** When set, simulate this many seconds, render one still frame and stop. */
  readonly frozenSeconds?: number;
  /** Shows the scene in a tank of this size, e.g. `?size=nano`. */
  readonly size?: TankSize;
  /** Overrides the scene seed. */
  readonly seed?: number;
  /** Fixed hour of the aquarium day (0..24), overriding the light cycle. */
  readonly hour?: number;
  /** Exact list of look features to enable, overriding the saved choices. */
  readonly effects?: readonly string[];
  /** Debug tools switched on at startup, e.g. `?debug=overlay,shapes`. */
  readonly debug?: readonly DebugTool[];
}

function isDebugTool(id: string): id is DebugTool {
  return (DEBUG_TOOLS as readonly string[]).includes(id);
}

function debugList(value: string | null): readonly DebugTool[] | undefined {
  if (value === null) return undefined;
  return value.split(",").filter(isDebugTool);
}

function tankSize(value: string | null): TankSize | undefined {
  return TANK_SIZES.find((size) => size === value);
}

function nonNegativeNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** `?effects=shadows,bloom` enables exactly those features; `?effects=none` turns all off. */
function featureList(value: string | null): readonly string[] | undefined {
  if (value === null) return undefined;
  if (value === NO_FEATURES) return [];
  return value.split(",").filter((id) => FEATURE_ID.test(id));
}

export function parseLaunchOptions(search: string): LaunchOptions {
  const params = new URLSearchParams(search);
  const requested = params.get("scene");
  const scene = requested !== null && SCENE_ID.test(requested) ? requested : undefined;
  const frozenSeconds = nonNegativeNumber(params.get("frozen"));
  const size = tankSize(params.get("size"));
  const seed = nonNegativeNumber(params.get("seed"));
  const effects = featureList(params.get("effects"));
  const hour = nonNegativeNumber(params.get("hour"));
  const debug = debugList(params.get("debug"));
  return {
    ...(scene === undefined ? {} : { scene }),
    ...(frozenSeconds === undefined ? {} : { frozenSeconds }),
    ...(size === undefined ? {} : { size }),
    ...(seed === undefined ? {} : { seed: Math.floor(seed) }),
    ...(effects === undefined ? {} : { effects }),
    ...(hour === undefined || hour > HOURS_PER_DAY ? {} : { hour }),
    ...(debug === undefined ? {} : { debug }),
  };
}

/** The query (`?scene=reef&debug=overlay`) that opens the aquarium with `options`; "" for none. */
export function launchQuery(options: LaunchOptions): string {
  const params = new URLSearchParams();
  if (options.scene !== undefined) params.set("scene", options.scene);
  if (options.frozenSeconds !== undefined) params.set("frozen", String(options.frozenSeconds));
  if (options.size !== undefined) params.set("size", options.size);
  if (options.seed !== undefined) params.set("seed", String(options.seed));
  if (options.hour !== undefined) params.set("hour", String(options.hour));
  if (options.effects !== undefined) {
    params.set("effects", options.effects.length === 0 ? NO_FEATURES : options.effects.join(","));
  }
  if (options.debug !== undefined) params.set("debug", options.debug.join(","));
  const query = params.toString().replaceAll("%2C", ",");
  return query === "" ? "" : `?${query}`;
}
