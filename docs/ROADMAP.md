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

- [x] Legs that move: done another way. Walking species are drawn as
      skinned bodies playing a walk clip (`render/walkingBodies`,
      `animations.walk` in `model.json`), not with a limb attribute in
      the shader.
- [x] A procedural shrimp body (`render/crustaceanGeometry`, shape
      `shrimp`), the light fallback.
- [x] A `crawl` style: walking on the floor and following its rise and
      fall, stopping to pick at the ground, leaving it for food, a fright,
      the finger or a place higher up, then sinking back (48e11e9).
- [ ] Short swims of its own accord: today a shrimp only leaves the floor
      when something calls it; antennae that always move.
- [ ] Tapped, it flicks its tail and darts backwards (today it runs off
      like a fish), then walks again when calm.
- [x] Red cherry shrimp for planted tanks: species entry, fauna card,
      docs (`docs/SWIMMING.md`).
- [ ] Marbled shrimp for reefs: one more coloring of the same shape
      (block H) and a species entry.
- [x] The model: our own, from `scripts/blender/shrimp.py`, rigged with a
      walk clip, instead of the out work download.

### D4. Crabs and hermit crabs

- [x] Crabs on the `crawl` style and shader limbs of D3: sideways, around
      obstacles, stopping to pick at the sand, eating flakes that reach the
      bottom.
- [x] Tapped, they scuttle away or hide: a crab under the nearest shelter,
      a hermit crab into its shell (it stops and sinks down), coming out
      again when calm.
- [x] Species entries and fauna cards (freshwater crab for planted tanks,
      hermit crab for reefs), docs, `ASSETS.md`.

The crab model is a scan (CC0, ffish.asia), the hermit crab a CC-BY
model by kenchoo; both walk with their own skeletal clips (walk, and hide
for the hermit crab, from `scripts/blender/hermit_crab.py`), as the
shrimp does.

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
- [x] Sliders in the panel for every effect's parameters, built-in or
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

- [x] `model.json` lists colorings by id, each a base-color texture;
      validated with Zod, a missing coloring or texture logs a warning and
      falls back to the model's own.
- [x] Plain colors per material, and a credit for colorings that come
      from elsewhere. The red cherry shrimp's model is grey and wears
      `cherry`; `blue-dream`, `yellow` and `black-rose` come with it.
- Later: colorings as a pattern mask (one image tinted with two or
  three colors per strain), when the fish maker recolors live or phones
  need lighter downloads (I6).
- [x] A species names its model and coloring (`model`, `coloring`).
- [x] Several species share one folder, so the shape is downloaded and
      kept on the GPU once: each species gets its own geometry over the
      same vertex buffers (`sharedShape` in `render/fishRenderer.ts`).
- [x] Strains: a species may list several colorings with weights; each
      fish wears one and keeps it, so a school mixes them (picked from
      the fish's id, like its fin beat, so the seeded draws stay as they
      were). Instanced like today: a per-instance layer of a texture
      array, not one draw per coloring.
- [x] Fauna cards show the species' first coloring; docs in
      `docs/FISH_MODELS.md`: how to paint colorings in code
      (`fish.json` recipes, `paintkit.py`). The guppy wears four
      strains, the platy three.

## I. Ready-made aquariums

Asked on 2026-10-18, after the Hero scene: aquariums ready to show, from a
small one on a desk to a large public tank, each realistic and each with
a look of its own. One of them is a clownfish lagoon: soft anemones
swaying in the current and clownfish living in them, as in the films
everyone remembers (no names or marks of the film, as AGENTS.md says).
Everything stays data: sizes, looks and scenes are JSON; code only where
the engine lacks something (soft tentacles, fish inside them).

### I1. Tank sizes

The size of a tank does not depend on what is in it (checked by the
user on 2026-10-24: a shark in a small tank works once the panel's fish
size draws every species alike). Each scene sets its own measures, and
the scene editor resizes a tank; no presets and no smallest tank per
species are needed.

- [x] Fish sizes in a small tank: real sizes stay true; the size balance
      of the panel brings them together.
- [x] Sizes as a choice, asked by the user on 2026-10-24: `nano`,
      `small`, `medium`, `large`, `ocean`. A scene may say its own
      (`size`); the panel's Tank size and `?size=` show any scene at
      another (`scene/tankSize.ts`): fewer fish (square root of the
      volume), plants and objects by floor area, true sizes kept. Scenes
      with block rock keep their tank.
- [x] The floor's relief follows the tank: the dunes shrink, in height
      and length, in tanks lower than a large one (`floorOf` in
      `sim/terrain.ts`).
- [x] A small tank has its own back and floor: a `nano`, `small` or
      `medium` tank seen from an open-water scene gets a panel on its
      back glass in the backdrop's colors, and the sand ends there.

### I2. Four realistic looks

Each a file in `public/looks/`, listed in the panel's Look section and
tuned against reference photographs, with every parameter a slider.

- [ ] Reef under LEDs: crystal clear water, little absorption, white and
      actinic blue spots, coral fluorescence, no surface waves.
- [x] Planted freshwater: see J2.
- [x] Open sea: the Hero look as it is (`looks/hero.json`).
- [x] Clownfish lagoon: shallow, sunny turquoise water, bright caustics on
      the sand, warm sun, soft sunbeams (`looks/lagoon.json`, worn by
      the nano reef).
- [ ] Night tank (optional fifth): moonlight blue, fluorescence, the
      fish resting.

### I3. Soft anemones

- [ ] Tentacles that move one by one, not the whole anemone: each its own
      phase and rhythm (a per-tentacle attribute baked by
      `scripts/blender/anemone.py`), bending along all its length, softer
      at the tips, with a slow pulse of the whole anemone.
- [ ] They part around a fish passing through and close behind it
      (positions of the nearest fish as shader uniforms, no allocations).
- [ ] Long-tentacle morphs besides the bubble tip (e.g. a carpet and a
      long-tentacle anemone), from the same script; the clownfish host in
      all of them by the `anemone` tag.

### I4. Clownfish living in their anemone

- [ ] A host fish dips into its anemone, rubs along the tentacles and
      comes out a little way to look around, then goes back (the `hover`
      style around its home, with a dive into it).
- [ ] A pair shares an anemone, the larger one keeping close to it;
      startled, they hide deep among the tentacles.
- [ ] Drawn among the tentacles, partly hidden by them, without popping
      in front or behind.

### I5. The aquariums

- [x] Nano reef: a clownfish pair in a magnificent anemone, a few
      corals, the Clownfish lagoon look; 1 m wide rather than 60 cm, and
      the scene phones open (`phone` in `scenes/index.json`).
- [ ] Clownfish lagoon (120 cm): the soft anemones of I3 and the clownfish
      of I4 in front, coral garden and sand; Clownfish lagoon look.
- [ ] Planted tank and Iwagumi: see block J.
- [ ] Home reef (250 cm): today's scene with the coral scans and live
      rock.
- [x] Hero (public, 6 m) is the starting scene (29f5a82); Aquaria stays
      in the list.
- [ ] Each with its caption, gallery picture, card picture and visual
      baseline, grouped by size in the panel.

### I6. Light enough for phones

- [ ] Lighter versions where phones need them: coral scans at a few
      thousand triangles further away (levels of detail), coarser block
      rock, fewer seagrass tufts; measured on the Redmi Note 14 Pro.
- [ ] The Hero scene runs at a usable frame rate on that phone; state the
      numbers before and after.

## K. Fish maker

Asked on 2026-10-24; comes before J (its plants follow the same idea, and
the iwagumi's rasbora is K3). Today each Blender-made fish is a Python
script (`guppy.py`, `platy.py`, `royal_gramma.py`…) that repeats the
others but for its numbers (outline, fins, eye) and its paint. The maker
takes those out of the code: a fish becomes data, as AGENTS.md wants for
species, and a page draws it over a photograph. Blender stays the
builder, behind a button: one source of truth for the shape, the eye
bones and the mouth shape key.

### K1. A fish as data

- [x] A recipe, `fish.json`: the body (top and bottom outline, thickness,
      roundness), the fins (body, tail, pectoral, pelvic, filament), the
      eye and the mouth, and the strains, each a stack of paint layers;
      validated by `src/scene/fishRecipe.ts` (a test checks every recipe).
- [x] Paint layers from those already written (`fishpaint.py`): patches
      of bands (countershading, cheeks, lips), edges (the guppy's tuxedo,
      the gramma's split), round marks (Mickey Mouse, the sardine's
      spots), speckles (Blue Grass), snakeskin (Cobra), noise, the line
      through the eye, radiating lines, the gill blush, scales; on fins a
      rayed web with tints, dots, snakeskin and marks. Stripes and bars
      come with the first fish that needs them.
- [x] One generic builder, `scripts/blender/fishbuild.py <recipe>`: it
      writes `model.glb`, `colorings/*.webp` and `model-values.json` (the
      gills, pectoral fins and colorings for `model.json`).
- [x] The guppy, platy, royal gramma, angelfish and sardine as recipes:
      their paint comes out the same to the texel (the guppy's pectoral
      fin, now a plain rayed web, differs slightly), their shapes within a
      ten-thousandth of a body length, their `model.json` values the
      same; the scripts are removed.

### K2. The designer

- [x] `/fish-designer.html` (with `pnpm dev`, linked from `/debug.html`):
      a photograph of the real fish under a side view, the outline and
      fin points dragged over it (`scene/fishOutline`, `scene/fishHandles`,
      `ui/sideView`).
- [x] Paint layers listed with their colors and numbers, per strain:
      moved, removed, added from a template; each fin's painter.
- [x] Build: the dev server (`scripts/fishMakerServer.ts`) runs Blender
      and the compression and lays the measured values over `model.json`;
      the model viewer under the drawing shows the real 3D fish. Save
      writes the recipe.
- [ ] A flat preview of the strains while you edit them: it would mean
      painting in TypeScript too; for now Build shows them in a few
      seconds.

### K3. Proof and docs

- [x] A harlequin rasbora made without code of its own: a recipe, built by
      the fish maker's server and checked on its page, now the 3D model of
      the species already in the planted tank (12 of them). It needed one
      thing the format lacked, a polygon with a soft edge for its black
      wedge: the generic `shape` layer, on bodies and fins, its corners
      dragged on the page. It joins the iwagumi in J5.
- [x] `docs/FISH_MODELS.md` (+ Italian): making a fish with the maker.

Not in this block: painting on a model made by someone else (projection
on its own UVs).

## J. Freshwater aquariums that look real

Asked on 2026-10-24, after the Hero: the Planted tank and the Iwagumi
look far behind it. Their plants are the generators from before the Hero
(flat cards in one green: carpet discs, stick stems), their water and
light are the open sea's (haze, sunbeams, marine snow, a 2.2 to 2.4 m
tank), the iwagumi stones are pillars, the driftwood is cylinders, and
everything is scattered on a flat floor. A real planted tank has clear
water under a white lamp, a clean background, a floor rising towards the
back, three layers of plants in groups, and one focal point. Order:
J2, J4, J3, J1, J5; the look alone changes the most, plants and stones
are the long part. After block K.

### J1. What the engine lacks

- [x] A floor profile in the scene: `floor.rise` (towards the back, a
      share of the tank height) and `floor.dunes`, with dunes scaled to
      the tank instead of ±12 cm. Mounds and terraces are left out.
- [x] Particles per scene: marine snow for the sea; almost none in fresh
      water (the look's `snow`), and oxygen bubbles rising from the leaves
      in the afternoon (`water.pearling`, `sim/pearling.ts`).
- [x] A background panel: backdrop `panel` (frosted white, black, or a
      gradient) on the back glass, where the floor ends; the side glass
      mirrors the floor. Worn by the Planted tank and the Iwagumi.
- Later, not now (user, 2026-10-25): a home tank seen whole, optional
  and set by parameters, never the default view. The camera steps back
  to show rimless glass with visible edges, silicone in the corners and
  a slim lamp above; it needs a picture of the room behind the tank to
  load first.

### J2. The Planted freshwater look

- [x] `looks/planted.json`: clear water with little absorption, white
      6500 K light from above, soft caustics, no volumetric shafts, a
      quiet surface, full colors; tuned against reference photographs,
      like the Hero. Worn by the Planted tank and the Iwagumi, which also
      got darker, clearer water, a near-black backdrop and an even light
      from above instead of a row of spots. The floor still runs on past
      the tank into the dark: the back panel is J1.

### J3. Plants made in Blender

On `scripts/blender/plantkit.py`, with painted textures (paintkit):
veined leaves in two tones, light through them, swaying.

- [x] Carpet: dwarf hairgrass (`hairgrass`, tufts of 60 to 90 blades,
      `scripts/blender/freshwater_plants.py`), not discs.
- [x] Stem plants in thick groups: Rotala, red-tipped and green variants
      (`rotala`). Ludwigia is left out; the red tips are still shy.
- [x] Rosettes: Cryptocoryne, green and bronze; Vallisneria as tall
      ribbons at the back. Amazon sword is left out.
- [x] Java fern, Anubias and moss (`java-fern`, `anubias`,
      `moss-cushion`, `scripts/blender/epiphytes.py`). They stand on the
      floor beside the stones and wood: growing on them waits for a
      surface to attach to (J5).
- [x] Painted textures for the leaves: a grey texture of veins
      (`scripts/blender/leafpaint.py`) multiplied by the colors of the
      leaf's points, on all seven freshwater plants.

### J4. Hardscape made in Blender

- [x] Seiryu stones: angular, layered, blue-grey with pale veins, in
      several sizes, for an iwagumi composition (one main stone leaning,
      two to six around it). `seiryu-stone`, six stones from
      `scripts/blender/seiryu.py`, in the Iwagumi; composing them is J5.
- [x] Driftwood: branching roots (spider wood, manzanita) with bark,
      instead of cylinders. `branching-driftwood`, three pieces from
      `scripts/blender/driftwood.py`, in the Planted tank.

### J5. The scenes

- [ ] Iwagumi: the stones composed, a carpet, one large school; little
      else.
- [ ] Planted tank: a driftwood centrepiece, red and green stem plants in
      contrast at the back, Cryptocoryne in the middle, a carpet in front,
      neons, angelfish and shrimps.
- [ ] Each with its caption, gallery picture, card picture and visual
      baseline; measured on the phone (I6).

## Ideas to discuss

Raised by the user, not planned yet.

- My fish (care mode), for the phone's small reef: a pet of your own to
  keep alive, feed at its hours, play with (the finger, the torch, the
  spells) and watch grow up over days; its state saved in the browser,
  gentle reminders, nothing that punishes a missed day too hard. No names
  or marks of existing toys.
- The phone's own sensors, for the small reef:
  - Tilt the phone and the view turns with it (gyroscope), so the reef
    shows its depth as if seen through a small window; the camera moves a
    little and slowly, never far enough to leave the tank.
  - A quick sideways shake knocks on the tank like a nudge to a pinball
    table: the fish startle and dart to cover, then come back out; too
    many shakes in a row and they hide longer.
  - Both read through `src/input/` as events, as INTERACTION.md asks;
    iOS needs the viewer's permission for motion sensors, asked on a tap.

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
- Mirrored side glass, to propose on 2026-10-26: seen through the front
  glass, the side glass reflects the whole tank (total internal
  reflection), which makes a real aquarium look wider than it is. Today
  only the sand is mirrored. Not in the browser: planar reflections would
  draw the scene up to twice more each frame, and WebGL and WebGPU have
  no hardware ray tracing. To be proposed with an engine that does not
  run in the browser but inside Unreal, reading the same scene and
  species JSON.
