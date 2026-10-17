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

- [x] Styles and activities assigned to all 18 species; visual review.
      Pecking, places, food, shelters and pockets tuned by measurement on
      the bundled scenes, then reviewed in the tank.

### B5. Collisions

- [x] Fish swim around rocks, corals and wood (rough shapes per kind,
      look-ahead swerve, hard gap), and come right up to them at a place.
- [x] Fish of different species keep out of each other's way, the
      smaller giving way; overlapping bodies are pulled apart.
- [x] `C` in the `A` overlay outlines the collision shapes.
- [x] Voxel rockwork (C1) answers the same distance query, so overhangs
      and caves need no change in behavior.

## C. Scene editor

Entering editing turns the same window into an editing view: fish, food,
bubbles and post-processing disappear, the simulation stops and the camera
switches to an isometric view. Save or exit rebuilds the tank with the saved
scene.

### C1. Schema

- [x] Rockwork as a voxel grid (run-length encoded in the JSON), next to the
      existing procedural ridge, which stays valid.
- [x] Flora and props with explicit placements (`at`: position, rotation,
      scale) or painted areas, as an alternative to count + depth bands.
      Painted areas come with the brush (C4).
- [x] Smooth rock mesh from voxels (surface nets + noise), pure and tested;
      renderers and `sim/layout` honor placements.

### C2. Editing mode and voxels

- [x] Editing view: isometric orthographic camera, 90° rotation steps, zoom
      and pan, floor grid.
- [x] Voxel tools: add on the clicked face, remove, 3D brush with selectable
      size, slicing by layer; blocky preview with a "smooth" switch.
- [x] Mouse and touch (tap, drag, release) through pointer events.
- [x] Save, save as new, exit without saving.

### C3. Palette and placement

Comes after block E: the palette lists the object folders.

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

## E. Objects as files

Plants and objects become folders of data, like the species: a standard
`.glb` any 3D program opens, plus a documented Aquaria contract that only
Aquaria carries out and other programs simply ignore. Comes before C3.
Scenes keep naming objects by `kind`, now the folder id, so every scene
still loads unchanged.

### E1. The contract

- [x] `public/assets/objects/<id>/object.json`, validated with Zod: name,
      optional `model` (a `.glb` in the folder), optional `material` (a
      path relative to the file), optional `recipe` (a registered
      generator, its parameters and a seed range), `traits`, `credit`.
      `object.json` is the source of truth; a model without one is not an
      object.
- [x] Traits are optional, non-standard features, one file each,
      registered by id like the swimming styles: schema with a default for
      every parameter, and the code that carries it out. First ones:
      `sway`, `collision`, `tags`, `placement`. An unknown trait logs a
      warning and is skipped.
- [ ] Per-vertex traits read a custom glTF attribute (`_SWAY`: how much
      each point sways), which Blender can paint.
- [x] `public/assets/materials/<id>/material.json`: texture paths, tile
      size, credit; the folders as they are today stay valid.
- [x] `docs/OBJECTS.md` (+ Italian version): the contract, every trait,
      how to make an object in Blender.

### E2. Today's kinds as objects

- [x] Every flora and prop kind becomes a folder whose `recipe` is
      today's procedural generator, so nothing changes on screen.
- [x] Renderers, `sim/layout`, collisions and places read the object's
      traits instead of tables in the code (`PROP_PLACEMENT`, tags).

### E3. Export and import

- [ ] `pnpm export:objects` bakes each recipe into `model.glb` (a few
      seeds), with standard PBR material, `_SWAY` and the traits copied
      into the glTF `extras`, so a round trip through Blender keeps them.
- [ ] Block rock exports the same way.
- [ ] A `.glb` from elsewhere becomes an object by adding an
      `object.json`; with a model and a recipe, Aquaria draws the recipe's
      variants and the model is the fallback.

## Ideas to discuss

Raised by the user, not planned yet.

- Tank sizes: preset sizes (nano to large); each species gets a smallest
  tank from aquarium practice, so big fish cannot go in small tanks and
  small fish are advised against in very large ones.
- Predators: a big, hungry fish chases a much smaller one and may eat it;
  limits (hunger, size ratio, short chase, escape to a shelter), whether
  the prey is really removed, and a panel switch.
- An evolving tank: a few individual fish, each with an id, a name and
  unique marks (a spot on the back, a stunted fin...), driven by a small
  neural network of its own, inherited with mutations (neuroevolution),
  so they adapt and evolve like real species; needs birth, death and the
  tank saved between sessions.
