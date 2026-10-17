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
- [x] The same cards are reused by the scene editor's palette (C3).

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

- [x] Palette of cards for every flora and prop kind (data-driven).
- [x] Drop on sand or on rock tops, move, rotate, scale, delete; items fall
      to the next support when the block under them is removed.
- [x] Undo / redo.

### C4. Finishing

- [x] Brush for carpets and plant groups (painted areas with a density).
- [x] Environment tab: water, floor, backdrop, murkiness (the Scene tab,
      with biomes: the environment of any bundled scene).
- [x] "Convert to blocks" for scenes with a procedural ridge.
- [x] Remove the old form-based designer; update README and user guides.

## D. Beyond the fish

Animals that are not fish, after the editor (crabs and shrimps walk on the
rockwork C1 builds). The sea turtle (CC-BY-4.0) is in
`public/assets/animals/`. Models in `downloads/` (licenses checked): a hermit
crab (CC-BY-4.0), a freshwater crab (CC0). A shrimp, to download: "shrimp"
by out work (CC-BY-4.0,
https://sketchfab.com/3d-models/shrimp-f9749f8e0c5a48919abfd1f7a79ca043),
hand-modeled, no textures, parts split by material (11), about 813k faces
to decimate; one shape colored per species (block H).

### D1. Skeletal animation

- [x] `model.json` names the clips (swim, walk, idle) and how their speed
      follows the animal's; skinned models play them, few instances each,
      while fish keep their instanced, shader-swum bodies.

### D2. Distant turtles

- [x] Scenery fauna: turtles swim slowly far behind the tank, in the haze
      of the backdrop, now and then; not a fauna card, not selectable, no
      reactions. Data-driven per scene.

### D3. Shrimps

Comes before the crabs: shrimps bring walking on the bottom, the crabs
reuse it. The procedural body first, the model after.

No skeletons here: the model has no bones, and on the bottom these animals
are a few pixels tall, where how they glide, the antennae and the tail flick
show, single steps do not.

- [ ] Limbs moved in the shader: the body moves as one piece, driven by the
      simulation; legs, antennae and tail move in the shader, instanced
      like the fish. Which part is which comes from a per-vertex limb
      attribute (painted in Blender like `_SWAY`, or taken from the
      model's materials; written by procedural bodies);
      `docs/FISH_MODELS.md` tells how to paint it.
- [ ] A procedural shrimp body: segmented curved body, fan tail, long
      antennae, thin legs, with the limb attribute; colors per species.
- [ ] A `crawl` style: walking forward on the seabed (sand, rockwork,
      plants), around obstacles, stopping to pick at the surface with the
      small claws, eating flakes that reach the bottom.
- [ ] Short swims: now and then a shrimp lifts off and swims a little way
      with its legs, then settles again; antennae always moving.
- [ ] Tapped, it flicks its tail and darts backwards, then walks again when
      calm.
- [ ] Species entries and fauna cards (red freshwater shrimp for planted
      tanks, marbled shrimp for reefs), small groups; docs.
- [ ] Then the out work model: decimated to a few thousand triangles, the
      limb attribute from its materials, one shape with a coloring per
      species (block H); `ASSETS.md`.

### D4. Crabs and hermit crabs

- [x] Crabs on the `crawl` style and shader limbs of D3: sideways, around
      obstacles, stopping to pick at the sand, eating flakes that reach the
      bottom.
- [x] Tapped, they scuttle away or hide: a crab under the nearest shelter,
      a hermit crab into its shell (it stops and sinks down), coming out
      again when calm.
- [x] Species entries and fauna cards (freshwater crab for planted tanks,
      hermit crab for reefs), docs, `ASSETS.md`.

Done without the shader limbs of D3: legs, claws and antennae are still,
the bodies glide. The crab model is a scan (CC0, ffish.asia), the hermit
crab a CC-BY model by kenchoo; both carry skeletons and walk clips that
species bodies do not play yet.

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
- [x] Per-vertex traits read a custom glTF attribute (`_SWAY`: how much
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

- [x] `pnpm export:objects` bakes each recipe into `model.glb` (a few
      seeds), with standard PBR material, `_SWAY` and the traits copied
      into the glTF `extras`, so a round trip through Blender keeps them.
- [x] Block rock exports the same way.
- [x] A `.glb` from elsewhere becomes an object by adding an
      `object.json`; with a model and a recipe, Aquaria draws the recipe's
      variants and the model is the fallback.

## G. A look that fits the machine

Comes before block F. The aquarium starts on any screen, from a laptop to a
4K LED wall, and finds by itself how much it can show.

- [x] 30 frames a second by default; 60 and no limit stay in the panel.
- [x] At startup it begins with a light base look, measures the GPU time
      of each frame and adds one feature at a time while there is room:
      lighting first, then post-processing effects (shaders of block F
      at the end). A feature that runs over the budget is taken away and
      the next one is tried; afterwards only the resolution adapts.
- [x] Each feature declares in its own data whether it is part of the base
      look, added when the machine allows it, or left to the viewer
      (ambient occlusion, depth of field, SMAA).
- [x] The viewer's own switches always win; `?effects=` and frozen
      frames skip the calibration. Without a GPU timer the defaults are
      kept.
- [x] The panel tells which features the calibration chose, and can run
      it again.

## F. Shaders and effects as files

Effects become folders of data, like objects and species: a viewer or an
artist adds one without touching the code or rebuilding. GLSL only runs on
the GPU, so a shader file is safe to load; plugins with JavaScript come
later, from trusted sources only.

### F1. The contract

- [x] `public/effects/<id>/effect.json`, validated with Zod: name, stage
      (`hdr` or `display`), startup role (as in G), parameters with a
      range and a default, credit.
- [x] A fragment shader in the folder (`.glsl`), given the frame, time,
      resolution, frame count and its parameters as uniforms; a broken
      shader logs a warning and its switch is left out.
- [x] Loaded at startup next to the built-in `EFFECTS`, which stay as
      they are; each one is a switch in the panel. First one: _Water
      shimmer_.
- [ ] Sliders in the panel for every effect's parameters, built-in or
      made of files.
- [ ] Depth of the scene for effects made of files (fog, focus): needs a
      depth pass, so only when an effect asks for it.

### F2. Waves seen from below

The surface is geometry in the scene, not a full-screen pass, so it is a
lighting feature of the renderer rather than a file effect. In alpha:
_Surface waves (alpha)_ is a manual switch, its look not settled yet.
Shafts that start from the glare, smoothed in several low-resolution
passes, wait on the local branch `alpha/waves-and-rays`: they still band
under LED spots and in sunlight.

- [ ] The underside of the water as moving waves: total reflection at a
      slant, the bright window of the sky overhead (Snell's window), the
      glare of the sun through the waves, as in the hero image.
- [ ] Light shafts and caustics start from the same waves and move with
      them.
- [ ] Scene data drives it (wave height, speed, sun glare); state the
      measured cost.

### F3. Writing an effect

- [x] `docs/EFFECTS.md` (+ Italian version): the contract, the uniforms,
      a worked example, how to try a shader in the tank.

## H. One model, many colorings

Fish of the same shape differ in their colors: one model can dress several
species (the tangs, the shrimps of D3) and several strains of one species
(guppies, platies, red and blue shrimps). Comes before the D3 model. A
species with no coloring looks as today.

- [ ] `model.json` lists colorings by id: textures (base color, optional
      pattern mask) or plain colors per material, credit when they come
      from elsewhere; validated with Zod, a missing texture logs a warning
      and falls back to the model's own.
- [ ] A species names its model and coloring (`model`, `coloring`); several
      species share one folder, so the shape is downloaded and kept on the
      GPU once.
- [ ] Strains: a species may list several colorings with weights; each
      fish draws one from the seeded RNG and keeps it, so a school mixes
      them. Instanced like today (a per-instance index into a texture
      array or atlas), not one draw per coloring.
- [ ] Fauna cards show the species' first coloring; docs in
      `docs/FISH_MODELS.md`: how to paint a coloring in Blender.

## Ideas to discuss

Raised by the user, not planned yet.

- Tank sizes: preset sizes (nano to large); each species gets a smallest
  tank from aquarium practice, so big fish cannot go in small tanks and
  small fish are advised against in very large ones.
- A catfish (model in `downloads/catfish-3d-model.zip`, license to check),
  with a swimming style of its own: a bottom dweller that rests on the
  sand, glides along it whiskers first and sifts it for food.
- Predators: a big, hungry fish chases a much smaller one and may eat it;
  limits (hunger, size ratio, short chase, escape to a shelter), whether
  the prey is really removed, and a panel switch.
- An evolving tank: a few individual fish, each with an id, a name and
  unique marks (a spot on the back, a stunted fin...), driven by a small
  neural network of its own, inherited with mutations (neuroevolution),
  so they adapt and evolve like real species; needs birth, death and the
  tank saved between sessions.
