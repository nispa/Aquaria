/** Scene ids double as file names, so they are restricted. */
const SCENE_ID = /^[a-z0-9-]+$/;
const FEATURE_ID = /^[a-z0-9-]+$/;
const NO_FEATURES = "none";
const HOURS_PER_DAY = 24;

/** Options read from the page URL, e.g. `?scene=reef&frozen=10&seed=3`. */
export interface LaunchOptions {
  /** Scene id; when absent the saved or default scene opens. */
  readonly scene?: string;
  /** When set, simulate this many seconds, render one still frame and stop. */
  readonly frozenSeconds?: number;
  /** Overrides the scene seed. */
  readonly seed?: number;
  /** Fixed hour of the aquarium day (0..24), overriding the light cycle. */
  readonly hour?: number;
  /** Exact list of look features to enable, overriding the saved choices. */
  readonly effects?: readonly string[];
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
  const seed = nonNegativeNumber(params.get("seed"));
  const effects = featureList(params.get("effects"));
  const hour = nonNegativeNumber(params.get("hour"));
  return {
    ...(scene === undefined ? {} : { scene }),
    ...(frozenSeconds === undefined ? {} : { frozenSeconds }),
    ...(seed === undefined ? {} : { seed: Math.floor(seed) }),
    ...(effects === undefined ? {} : { effects }),
    ...(hour === undefined || hour > HOURS_PER_DAY ? {} : { hour }),
  };
}
