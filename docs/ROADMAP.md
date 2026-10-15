# Roadmap

Work planned in October 2026: a lighter control panel, fish that do more than
swim back and forth, and an isometric, drag-and-drop scene editor. Everything
stays data-driven: species, swimming styles, activities, object tags and
palettes live in JSON; adding a species or an object kind needs no code.

Tick a task when it is merged with `pnpm lint`, `pnpm typecheck`, `pnpm test`
and `pnpm test:e2e` green.

## A. Control panel

### A1. Collapsible sections and a startup hour

- [x] Panel sections are `<details>` blocks; Scene and Fauna start open, the
      others (Time, Lights, Lighting, Post-processing, Scenery, Quality) start
      closed. The viewer's open/closed choice is saved in the settings.
- [x] Time gets its own collapsible section (cycle mode, hour, day length,
      sunrise, sunset, dawn/dusk), split from the LED setup.
- [x] New cycle mode `startup`, the default: the hour stays fixed at the local
      hour the aquarium was started. `?hour=` still pins any hour.
- [x] Fish size stays in the Fauna section.

### A2. Fish cards with live previews

- [ ] Fauna is a grid of cards: preview, name, − / count / +, 3D badge.
      Species in the tank first; absent ones dimmed.
- [ ] Previews rendered at runtime with the main renderer into one small
      shared render target, cached per species and body (procedural or 3D
      model); redrawn when the 3D badge changes.
- [ ] The same cards are reused by the scene editor's palette (C3).

## B. Fish behavior

All behavior is declared per species in `public/species.json` and validated
by Zod. Swimming styles and activities are one file each in
`src/sim/behaviors/`, registered in a table (like `EFFECTS`).

### B1. Swimming styles (how a fish moves)

- [ ] Speed varies over time instead of staying at cruise speed.
- [ ] Wander in 3D with the species' preferred height, not mostly along x.
- [ ] Styles with parameters: `cruise` (long smooth laps), `burst-coast`
      (dart, glide, slow down), `hover` (station keeping, small corrections,
      turns on the spot), `glide` (slow, height changes, figure eights),
      `patrol` (loop around a home spot).
- [ ] Tail effort and posture follow the thrust (strong in a burst, still
      while coasting).

### B2. Activities (what a fish is doing)

- [ ] Each fish has a current activity with a duration; when it ends the
      next one is picked by weights from the species data, the nearby
      environment and the hour (seeded RNG, deterministic tests).
- [ ] Points of interest: every flora and prop kind declares tags in data
      (e.g. `anemone: [anemone, shelter]`, `starfish: [starfish]`,
      `branch-coral: [coral, shelter]`, `rock: [rock, algae]`). Species
      declare which tags interest them and how much.
- [ ] Activities: `wander`, `inspect` (approach, circle or hover, leave),
      `peck` (head down, short thrusts, mouth opens).
- [ ] Development overlay showing each fish's activity (dev builds only).

### B3. Shelter, hosts and night

- [ ] `host`: a clownfish adopts an anemone, stays close, nestles in it, and
      hides there when startled.
- [ ] `shelter`: a startled fish heads for the nearest shelter instead of
      only darting away.
- [ ] `rest`: diurnal species rest near the floor or in a shelter at night;
      nocturnal ones become more active.
- [ ] Schools loosen when calm and tighten when startled.

### B4. Tuning

- [ ] Styles and activities assigned to all 18 species; visual review.

## C. Scene editor

Entering editing turns the same window into an editing view: fish, food,
bubbles and post-processing disappear, the simulation stops and the camera
switches to an isometric view. Save or exit rebuilds the tank with the saved
scene.

### C1. Schema

- [ ] Rockwork as a voxel grid (run-length encoded in the JSON), next to the
      existing procedural ridge, which stays valid.
- [ ] Flora and props with explicit placements (`at`: position, rotation,
      scale) or painted areas, as an alternative to count + depth bands.
- [ ] Smooth rock mesh from voxels (surface nets + noise), pure and tested;
      renderers and `sim/layout` honor placements.

### C2. Editing mode and voxels

- [ ] Editing view: isometric orthographic camera, 90° rotation steps, zoom
      and pan, floor grid.
- [ ] Voxel tools: add on the clicked face, remove, 3D brush with selectable
      size, slicing by layer; blocky preview with a "smooth" switch.
- [ ] Mouse and touch (tap, drag, release) through pointer events.
- [ ] Save, save as new, exit without saving.

### C3. Palette and placement

- [ ] Palette of cards for every flora and prop kind (data-driven).
- [ ] Drop on sand or on rock tops, move, rotate, scale, delete; items fall
      to the next support when the block under them is removed.
- [ ] Undo / redo.

### C4. Finishing

- [ ] Brush for carpets and plant groups (painted areas with a density).
- [ ] Environment tab: water, floor, backdrop, murkiness.
- [ ] "Convert to blocks" for scenes with a procedural ridge.
- [ ] Remove the old form-based designer; update README and user guides.
