# AGENTS.md

Guidelines for anyone (human or AI agent) contributing to this repository.
Read this file fully before writing code.

## Project overview

A browser-based, data-driven renderer for aquatic environments, designed to run
full-screen on large displays (up to 4K LED walls). Scenes (water, light, flora,
fauna, props) are described in JSON; the engine reads them and renders them in
real-time 3D with Three.js.

## Tech stack

- **Language**: TypeScript, `strict: true`. No plain `.js` source files.
- **Rendering**: Three.js with the WebGL2 renderer and GLSL shaders. A WebGPU
  renderer (TSL shaders) is planned; keep shader code isolated so it can move.
- **Build / dev server**: Vite.
- **Unit tests**: Vitest.
- **End-to-end and visual tests**: Playwright.
- **Schema validation**: Zod (scene descriptors and species catalog).
- **Lint / format**: ESLint (flat config, `typescript-eslint` strict) + Prettier.
- **Package manager**: pnpm.
- **Assets**: glTF/GLB models (meshopt or Draco compressed), KTX2 textures.

## Commands

```bash
pnpm install        # install dependencies
pnpm dev            # start dev server
pnpm test           # run unit tests (Vitest)
pnpm test:watch     # unit tests in watch mode
pnpm test:coverage  # unit tests with coverage thresholds
pnpm test:e2e       # end-to-end and visual tests (Playwright)
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
pnpm build          # production build
```

A change is complete only when `pnpm lint`, `pnpm typecheck` and `pnpm test`
all pass.

## Architecture

The code is layered. Dependencies point **downward only**.

```
src/
  core/      Pure utilities: seeded RNG, clock, math helpers, event bus.
  scene/     Scene descriptor + species catalog: Zod schemas, loading, validation.
  sim/       Simulation: boids, species behaviors, population manager, current.
  render/    Three.js adapters: scene graph, materials, shaders.
    effects/ Post-processing effects, registered by id; each is a panel switch.
  ui/        Control panel, presets, resolution slider, fps counter.
  input/     (post-MVP) Phone remote, webcam presence, head tracking.
  app/       Composition root: wires layers together, main loop.
```

Rules:

- `core`, `scene` and `sim` **must not import from `render`, `ui` or the DOM.**
  They must run in Node so they can be unit-tested without a browser or GPU.
- `sim` may use Three.js **math classes only** (`Vector3`, `Quaternion`, etc.),
  never renderer, material or scene-graph classes.
- `render` reads simulation state; it never decides behavior.
- Only `app/` knows about all layers. Pass dependencies explicitly
  (constructor or function parameters); no hidden singletons.
- Post-MVP input sources emit events on the event bus; behaviors subscribe.
  Adding an input source must not require changes in `sim`.

## Test-driven development

We practice TDD. For every change in behavior:

1. **Red**: write a failing test that describes the behavior. Run it and
   confirm it fails for the right reason.
2. **Green**: write the minimum code to make it pass.
3. **Refactor**: clean up with all tests green.

Rules:

- Never change or delete an existing test just to make it pass. If a test is
  wrong, explain why in the commit message.
- Never commit `.skip`, `.only` or commented-out tests.
- Bug fixes start with a test that reproduces the bug.
- Tests must be deterministic: use the seeded RNG from `core/` and an injected
  clock with a fixed time step. No `Math.random()` or `Date.now()` in tested code.
- Coverage thresholds (enforced in CI): `core`, `scene`, `sim` ≥ 90% lines;
  no threshold for `render` and `ui`.

What to test where:

- **Unit (Vitest)**: all logic in `core`, `scene`, `sim`. Schema validation,
  boids rules, depth-band constraints, population changes (spawn/despawn),
  resolution scaling math, current field.
- **Render**: keep adapters thin. Test the pure functions they use (e.g. fog
  and depth-of-field parameters from depth); smoke-test that a scene builds
  without throwing.
- **E2E / visual (Playwright)**: app boots, scene loads, control panel works,
  screenshot comparison of a fixed seed and fixed frame per scene.

Test style: one behavior per test, descriptive names
(`it("keeps bottom-dwelling species inside their depth bands")`),
Arrange / Act / Assert structure, no logic in tests.

## Code quality rules

General:

- Small, single-purpose functions and modules. Prefer pure functions.
- Descriptive names; no abbreviations except well-known ones (`fps`, `rng`, `id`).
- No `any`. Use `unknown` plus narrowing, or proper types.
- No non-null assertions (`!`) unless justified in a comment.
- Prefer `const`, immutable data and `readonly` types outside hot paths.
- Named exports only; no default exports.
- No magic numbers: named constants or config values.
- Validate all external data (JSON scenes, catalogs, user settings) with Zod at
  the boundary. Inside the app, trust the types.
- Errors: fail loudly at load time (invalid scene = clear error message);
  degrade gracefully at runtime (a missing model logs a warning and is skipped).
- No dead code, no commented-out code, no `console.log` in committed code
  (use the logger in `core/`).

Performance (the render loop runs at 60 fps at up to 4K):

- **No allocations in the per-frame loop.** Reuse vectors, arrays and objects;
  preallocate scratch variables.
- Use instancing for repeated meshes (fish of the same species, plants).
- Always `dispose()` geometries, materials, textures and render targets when
  removing them. Scene switches must not leak GPU memory.
- Clamp frame delta time to avoid simulation jumps after tab switches.
- Measure before optimizing; include before/after numbers in the PR.

Shaders:

- One shader or TSL node graph per file, in `render/shaders/`.
- Document uniforms (name, unit, range) at the top of the file.
- Keep shader parameters driven by the scene descriptor, not hard-coded.

## Effects

- Every effect is switched on or off individually by the viewer; there are no
  presets. Lighting features (caustics, shadows, reflections, refractive
  bubbles, light-shaft planes) are listed in `src/scene/look.ts`;
  post-processing effects are registered in `EFFECTS`.
- An effect is one file in `src/render/effects/` built with `defineEffect`
  and listed in `EFFECTS`. It declares its id, panel name, stage (`hdr`
  before tone mapping, `display` after), whether it is on by default, a Zod
  schema with a default for every parameter (the tuned look), and a `create`
  function returning a Three.js pass with `dispose()`.
- Heavy effects start off. State the measured cost when adding one.
- Passes that re-render the scene with override materials (depth, normals)
  must hide `context.shaderAnimated` objects they cannot represent and
  `context.overlays`, or they show up as ghosts.
- New effects must not require changes outside their own file and the
  registry.

## Scenes and species

- A scene is a JSON file in `public/scenes/`, validated by `src/scene/schema.ts`.
- A species is an entry in `public/species.json`. It uses either a `.glb` model
  in `public/assets/species/` or a built-in procedural body (MVP default).
- Adding a new scene or species must not require code changes, only data and
  assets. If it does, the engine is missing an abstraction: fix that first.

## Assets and licensing

- Code is licensed under the repository `LICENSE`. Assets may have different
  licenses.
- Every third-party asset must be listed in `ASSETS.md` with source URL,
  author and license. Only use CC0, CC-BY or equivalently permissive assets.
- Do not use names, logos or trademarks of real aquariums or brands.

## Git and pull requests

- Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`,
  `perf:`, `chore:`).
- Small, focused commits; tests and implementation in the same commit or in
  consecutive commits (test first).
- PRs describe what changed, why, and how it was tested. Visual changes
  include a screenshot.
- CI (GitHub Actions) runs lint, typecheck, unit tests with coverage, build
  and e2e tests on every PR. Do not merge on red.

## Documentation

- Code, comments, commit messages and docs are in **English**.
- Comment the _why_, not the _what_. Public functions in `core`, `scene` and
  `sim` have TSDoc comments.
- Update `README.md` and this file when commands, architecture or conventions
  change.
