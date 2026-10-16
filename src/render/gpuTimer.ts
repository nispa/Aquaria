/**
 * Measures how long the GPU takes to draw a frame, with the WebGL2 timer
 * query extension when the browser offers it. Results arrive a few frames
 * late, so a small ring of queries is kept in flight and reused.
 */

/** Queries in flight; results usually come back within two or three frames. */
const RING = 4;
const NANOSECONDS_PER_MS = 1e6;

interface TimerQueryExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

export interface GpuTimer {
  /** Whether the browser can time the GPU at all. */
  readonly supported: boolean;
  /** Wraps the GPU work of one frame. Allocation-free. */
  begin(): void;
  end(): void;
  /** The latest frame's GPU time that came back, ms, or undefined. Allocation-free. */
  latestMs(): number | undefined;
  dispose(): void;
}

function isTimerExtension(value: unknown): value is TimerQueryExtension {
  return typeof value === "object" && value !== null && "TIME_ELAPSED_EXT" in value;
}

export function createGpuTimer(gl: WebGL2RenderingContext): GpuTimer {
  const extension: unknown = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  if (!isTimerExtension(extension)) {
    return {
      supported: false,
      begin: () => undefined,
      end: () => undefined,
      latestMs: () => undefined,
      dispose: () => undefined,
    };
  }
  const queries = Array.from({ length: RING }, () => gl.createQuery());
  const pending = new Array<boolean>(RING).fill(false);
  let next = 0;
  let running = false;
  let latest: number | undefined;

  /** Collects every finished query, oldest first. */
  const collect = (): void => {
    for (let offset = 0; offset < RING; offset += 1) {
      const index = (next + offset) % RING;
      const query = queries[index];
      if (pending[index] !== true || query === undefined) continue;
      if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) !== true) continue;
      pending[index] = false;
      // A disjoint event (power state change…) spoils the measurement.
      if (gl.getParameter(extension.GPU_DISJOINT_EXT) === true) continue;
      const nanoseconds: unknown = gl.getQueryParameter(query, gl.QUERY_RESULT);
      if (typeof nanoseconds === "number") latest = nanoseconds / NANOSECONDS_PER_MS;
    }
  };

  return {
    supported: true,
    begin() {
      collect();
      const query = queries[next];
      // All queries still waiting: skip timing this frame rather than block.
      if (query === undefined || pending[next] === true) return;
      gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
      running = true;
    },
    end() {
      if (!running) return;
      gl.endQuery(extension.TIME_ELAPSED_EXT);
      running = false;
      pending[next] = true;
      next = (next + 1) % RING;
    },
    latestMs: () => latest,
    dispose() {
      for (const query of queries) gl.deleteQuery(query);
    },
  };
}
