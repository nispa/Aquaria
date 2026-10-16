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

- [x] Fauna is a grid of cards: preview, name, count slider, 3D badge.
      Species in the tank first; absent ones dimmed.
- [x] Previews rendered at runtime by a small renderer of their own, created
      when the panel first opens and released after the batch (the
      aquarium's renderer and effects are untouched); redrawn when the 3D
      badge changes.
- [ ] The same cards are reused by the scene editor's palette (C3).

## B. Fish behavior

All behavior is declared per species in `public/species.json` and validated
by Zod. Swimming styles and activities are one file each in
`src/sim/behaviors/`, registered in a table (like `EFFECTS`).

### B1. Swimming styles (how a fish moves)

- [x] Speed varies over time instead of staying at cruise speed.
- [x] Wander in 3D with the species' preferred height, not mostly along x.
- [x] Styles with parameters: `cruise` (long smooth laps), `burst-coast`
      (dart, glide, slow down), `hover` (station keeping, small corrections,
      turns on the spot), `glide` (slow, height changes, figure eights),
      `patrol` (loop around a home spot).
- [x] Tail effort and posture follow the thrust (strong in a burst, still
      while coasting).

### B2. Activities (what a fish is doing)

- [x] Each fish has a current activity with a duration; when it ends the
      next one is picked by weights from the species data, the nearby
      environment and the hour (seeded RNG, deterministic tests).
- [x] Points of interest: every flora and prop kind declares tags in data
      (e.g. `anemone: [anemone, shelter]`, `starfish: [starfish]`,
      `branch-coral: [coral, shelter]`, `rock: [rock, algae]`). Species
      declare which tags interest them and how much.
- [x] Activities: `wander`, `inspect` (approach, circle or hover, leave),
      `peck` (head down, short thrusts, mouth opens).
- [x] Overlay showing each fish's activity, toggled with A (first planned
      for dev builds only; kept in every build at the viewer's request).

### B3. Shelter, hosts and night

- [x] `host`: a clownfish adopts an anemone, stays close, nestles in it, and
      hides there when startled.
- [x] `shelter`: a startled fish heads for the nearest shelter instead of
      only darting away.
- [x] `rest`: diurnal species rest near the floor or in a shelter at night;
      nocturnal ones become more active. In realistic mode (a panel switch,
      added at the viewer's request), which also turns the playful spells
      off.
- [x] Schools loosen when calm and tighten when startled.

### B4. Tuning

- [ ] Styles and activities assigned to all 18 species; visual review.
      Styles are assigned (see `docs/SWIMMING.md`); activities and the
      visual review in the tank are still to do.

### B5. Collisions

- [x] Fish swim around rocks, corals and wood (rough shapes per kind,
      look-ahead swerve, hard gap), and come right up to them at a place.
- [x] Fish of different species keep out of each other's way, the
      smaller giving way; overlapping bodies are pulled apart.
- [x] `C` in the `A` overlay outlines the collision shapes.
- [ ] Voxel rockwork (C1) answers the same distance query, so overhangs
      and caves need no change in behavior.

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

## D. Beyond the fish

Animals that are not fish, after the editor (crabs walk on the rockwork C1
builds). Models in `downloads/` (licenses checked): a sea turtle
(CC-BY-4.0), a hermit crab (CC-BY-4.0), a freshwater crab (CC0).

### D1. Skeletal animation

- [ ] `model.json` names the clips (swim, walk, idle) and how their speed
      follows the animal's; skinned models play them, few instances each,
      while fish keep their instanced, shader-swum bodies.

### D2. Distant turtles

- [ ] Scenery fauna: turtles swim slowly far behind the tank, in the haze
      of the backdrop, now and then; not a fauna card, not selectable, no
      reactions. Data-driven per scene.

### D3. Crabs and hermit crabs

- [ ] A `crawl` style: walking on the seabed (sand and rockwork), crabs
      sideways, around obstacles, stopping to pick at the sand, eating
      flakes that reach the bottom.
- [ ] Tapped, they scuttle away or hide: a crab under the nearest shelter,
      a hermit crab into its shell (it stops and sinks down), coming out
      again when calm.
- [ ] Species entries and fauna cards (freshwater crab for planted tanks,
      hermit crab for reefs), docs, `ASSETS.md`.
