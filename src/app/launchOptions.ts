const DEFAULT_SCENE = "reef";
/** Ids of scenes and packs double as file names, so they are restricted. */
const SCENE_ID = /^[a-z0-9-]+$/;

/** Options read from the page URL, e.g. `?scene=reef&frozen=10&seed=3`. */
export interface LaunchOptions {
  readonly scene: string;
  /** When set, simulate this many seconds, render one still frame and stop. */
  readonly frozenSeconds?: number;
  /** Overrides the scene seed. */
  readonly seed?: number;
  /** Shader pack id, overriding the saved preference. */
  readonly pack?: string;
}

function nonNegativeNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function parseLaunchOptions(search: string): LaunchOptions {
  const params = new URLSearchParams(search);
  const requested = params.get("scene");
  const scene = requested !== null && SCENE_ID.test(requested) ? requested : DEFAULT_SCENE;
  const frozenSeconds = nonNegativeNumber(params.get("frozen"));
  const seed = nonNegativeNumber(params.get("seed"));
  const pack = params.get("pack");
  return {
    scene,
    ...(frozenSeconds === undefined ? {} : { frozenSeconds }),
    ...(seed === undefined ? {} : { seed: Math.floor(seed) }),
    ...(pack !== null && SCENE_ID.test(pack) ? { pack } : {}),
  };
}
