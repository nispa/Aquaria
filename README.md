# Aquaria

A real-time 3D aquarium for the browser, built for large screens: from a
Full HD monitor up to a 4K LED wall. Every tank is described in a JSON file
(water, light, current, plants, rocks and fish), and the engine brings it to
life with Three.js.

![The tropical reef scene with shadows, reflections, ambient occlusion, volumetric light and depth of field](docs/screenshot-realistic.jpg)

<sub>With most effects on. A lighter setup is in
[docs/screenshot.jpg](docs/screenshot.jpg).</sub>

## Features

- **Full 3D tank** seen through the glass: the camera frames the front of the
  tank to fill any screen, like a window into the water.
- **Caustics** on the sand, rocks, plants and fish, a rippling surface seen
  from below, light shafts, marine snow and rising bubbles.
- **Living fauna**: boids-based schooling, species habitats across five depth
  bands, 1 to 50 individuals per species with natural size variation. New fish
  swim in from the sides; surplus fish swim away instead of vanishing.
- **Shared water current** that bends the plants, drifts the particles and
  nudges the fish.
- **Anti-aliasing**: MSAA off, 2x (default), 4x or 8x from the panel, plus an
  optional SMAA pass.
- **Resolution slider** from 540p to 4K, independent of the screen size, with
  Full HD and 4K presets.
- **Made for LED walls**: dithering against banding in dark gradients, no
  permanent on-screen elements, full-screen kiosk use.
- **Every effect is a switch**: turn caustics, shadows, water reflections,
  refractive bubbles, ambient occlusion, volumetric light, depth of field,
  bloom and more on or off live from the panel, and add new effects without
  touching the rest of the engine.
- **Data-driven**: adding a scene or a species means writing JSON, not code.

## Getting started

Requirements: Node.js 22 and pnpm.

```bash
pnpm install
pnpm dev          # open the printed URL
```

Controls:

| Key / action   | Effect                              |
| -------------- | ----------------------------------- |
| `H`            | Show or hide the control panel      |
| `F`            | Toggle full screen                  |
| Move the mouse | Shows the panel button for a moment |

URL options:

| Option    | Example                  | Effect                                             |
| --------- | ------------------------ | -------------------------------------------------- |
| `scene`   | `?scene=home-reef`       | Opens `public/scenes/<scene>.json`, even unlisted  |
| `seed`    | `?seed=7`                | Overrides the scene's random seed                  |
| `frozen`  | `?frozen=10`             | Simulates 10 s and renders one still frame         |
| `effects` | `?effects=shadows,bloom` | Enables exactly these effects (`none` for all off) |
| `hour`    | `?hour=21.5`             | Pins the aquarium time (for demos and screenshots) |

Panel settings (populations, scenery, lights, effects, resolution, fps counter) are saved in the browser.

## Running on a wall

Build once, serve the `dist` folder and open it in Chrome in kiosk mode:

```bash
pnpm build
pnpm preview --host
chrome --kiosk --autoplay-policy=no-user-gesture-required http://localhost:4173
```

Disable sleep and the OS screen saver on the machine driving the wall. Start
at 4K, compare with Full HD from your usual viewing distance, and keep the
lowest setting you cannot tell apart: it saves GPU power.

### Use the dedicated GPU

On laptops and PCs with two GPUs, Windows often runs the browser on the
integrated one (Intel, or AMD "Radeon Graphics"), which cannot keep up at 4K.
The panel shows the GPU in use under **Quality**, with a warning when it is
the integrated or a software one. To switch Chrome (or Edge) to the dedicated
GPU:

1. **Windows graphics settings**: Settings → System → Display → Graphics.
   Find Google Chrome in the list (or add `chrome.exe` with _Browse_), open
   _Options_ and choose **High performance**. Save.
2. **Or the NVIDIA Control Panel**: Manage 3D settings → Program Settings →
   select Google Chrome → preferred graphics processor: **High-performance
   NVIDIA processor**. Apply. (AMD: Radeon Software → Graphics → per-app
   settings.)
3. **Or at launch**, add Chrome's switch to the kiosk command:

   ```bash
   chrome --kiosk --force_high_performance_gpu http://localhost:4173
   ```

4. Make sure hardware acceleration is on: `chrome://settings/system` → _Use
   graphics acceleration when available_.
5. **Close every Chrome window** (including background ones in the tray) and
   reopen it. Check `chrome://gpu`: _GL_RENDERER_ must name the NVIDIA (or
   AMD) GPU, and the panel's GPU line must match.

On a laptop, keep it on mains power: on battery, Windows may still prefer
the integrated GPU.

## Choosing a scene

The panel (`H`) starts with a **Scene** list; the choice is remembered, so the
plain URL reopens the last scene. The list is `public/scenes/index.json`, in
named groups ("Open sea", "Aquariums"); the first scene is the default.

## Scene designer

**Scene designer** (in the panel, `H`) edits the scene on screen: tank,
water, floor and its material, light and current, the rockwork, every plant
and object entry (add, remove, kind, count, colors or palette, size, depth
band, material, sand or rockwork) and the fish. The LED setup of the Lights
section is saved with the scene.

- **Preview** shows the draft without saving it; with **Auto preview** it
  follows every edit after half a second. Changed values are highlighted and
  **Revert** goes back to the scene you started from. (Each preview restarts
  the fish.)
- **Save as my scene** stores it in this browser, under **My scenes** in the
  scene list; editing one of your scenes offers **Save**, **Save as new** and
  **Delete**.
- **Export JSON** downloads the scene file. To ship it with the project, copy
  it to `public/scenes/` (the file name is its id) and add the id to a group
  in `public/scenes/index.json`. **Import JSON** loads such a file back;
  invalid files are explained field by field.

## Writing scenes

A scene lives in `public/scenes/<id>.json` and is listed in
`public/scenes/index.json` to appear in the panel. The tank is measured in meters:
`x` across the glass, `y` from the sand up to the surface, `z` away from the
glass. Depth is divided into five bands, 0 right behind the glass and 4 at the
back.

```jsonc
{
  "id": "reef",
  "name": "Tropical reef",
  "seed": 20260929,
  "tank": { "width": 5.4, "height": 3, "depth": 4 },
  "water": { "color": "#0a5a7a", "fogDensity": 0.13 },
  "light": { "color": "#fff4dc", "intensity": 1.3, "caustics": { "intensity": 0.9, "scale": 1.4 } },
  "current": { "direction": [1, 0, 0.2], "strength": 0.04, "turbulence": 0.35 },
  "backdrop": { "type": "gradient", "top": "#1a86a8", "bottom": "#021a2a" },
  "floor": { "color": "#d8c49a" },
  "flora": [
    { "kind": "kelp", "count": 10, "bands": [3, 4], "height": [1.4, 2.7], "color": "#5a9a3e" },
  ],
  "props": [
    { "kind": "brain-coral", "count": 4, "color": "#b8a05a" },
    { "kind": "starfish", "count": 1, "color": "#e8612c" },
  ],
  "fauna": [{ "species": "sardine", "count": 45 }],
}
```

Scenery entries:

- `flora` kinds: `kelp`, `seagrass`, `anemone` (tentacles that sway with the
  current), `bush` (grape-like macroalgae), and for planted aquariums
  `carpet`, `fern` and `stem`. A `tipColor` tints the leaves near the top. Each entry sets `count`, depth `bands`, `height` range and `color`.
- `props` kinds: `rock`, `starfish`, `shell`, `brain-coral`, `branch-coral`,
  `fan-coral`, `table-coral`, `mushroom-coral`, `leather-coral`, and for
  aquariums `driftwood`, `dragon-stone`, `moss` and `pebble`. `size` ([min,
  max] m) overrides the kind's default size.
- `water.surface` (0..1) sets how visible the underside of the surface is
  (low for aquariums) and `water.bubbles: false` turns the bubble streams off. Each entry sets `count` and `color`; `bands` is optional (small
  things default to the front, sea fans to the back).
- The floor and any prop entry may set a photographic `material`:
  `{ "id": "reef-rock", "tileSize": 0.45, "displacement": 0.07 }`. The id is a
  folder in `public/assets/materials/` with `normal.ktx2` and `surface.ktx2`;
  `tileSize` is the size of one texture tile in meters and `displacement`
  pushes the surface out by up to that many meters. The entry's `color` still
  sets the hue. A missing material logs a warning and falls back to the plain
  color. Available: sands and gravels `fine-sand`, `coarse-sand`,
  `aquarium-gravel`, `black-gravel`, `aqua-soil`; rocks `reef-rock`,
  `limestone`, `dark-slate`, `layered-rock`, `basalt`, `red-rock`,
  `mossy-rock`; woods `driftwood`, `rough-bark`, `mossy-wood`.
- `color` may be one color or a palette (`["#9a6fc2", "#e08fb0"]`): each item
  then takes one of the colors.
- `rockwork` (optional) builds a reef ridge: a mound of live rock winding
  across the tank with loose rocks piled on it. It sets depth `bands`, crest
  `height` range (m), `coverage` (share of the visible width), `thickness`
  (m), `rocks`, `color` and an optional `material`. Flora and prop entries
  with `"on": "rockwork"` grow on its surface instead of the sand.
- Any entry may have a `name`, used as its label in the panel. Every entry
  gets a slider in the panel's Scenery section; adding items never moves the
  ones already placed.

Species are defined once in `public/species.json`: body shape (`disc`, `round`,
`slender`, or the reef shapes `tall` and `banner`), color pattern (`belly`,
`tail`, `bands`, `split`, or the reef patterns `eye-bar`, `stripes`, `bars`,
`idol`), `base`, `accent` and optional `detail` colors, size, speed, schooling
(0 = solitary, 1 = tight school), depth bands and height range. The catalog
includes butterflyfish, moorish idols, emperor angelfish, three-bar damsels and
purple tangs.
Files are validated on load; mistakes are reported with the exact field.

## Lights and day cycle

The tank is lit like a reef aquarium, by four LED channels: white, actinic
blue, violet/UV and a free "accent" color, plus a faint blue moonlight at
night. Under blue and violet, corals and anemones fluoresce.

The **fixture** is either the open sky (one sun, for sea scenes) or an
aquarium lamp with a row of **LED spots**: they shine above the water, with
soft cones of light and pools of light on the bottom.

The panel's Lights section starts on **Recommended** (the scene's setup).
Changing any control switches to **Custom**, saved in the browser:

- **Fixture**: open sky or LED spots, and how many spots.
- **Cycle**: _Fixed hour_, _Real clock_ (follows the local time) or
  _Accelerated day_ (a whole day in the chosen minutes, starting from the
  chosen hour).
- **Sunrise**, **Sunset** and **Dawn / dusk** length. The blue switches on one
  dawn earlier and off one dusk later than the white, as on real reefs.
- **Color and level** of each channel, and the **moonlight** level.

A scene sets its own recommended lights in a `lights` object with the same
fields (all optional), for example sunlight for an open-sea scene:

```jsonc
"lights": {
  "channels": { "white": { "level": 1 }, "blue": { "level": 0.2 }, "violet": { "level": 0 } },
  "moon": 0.05,
  "fixture": { "type": "sun" },
  "cycle": { "mode": "clock", "sunrise": 8, "sunset": 20, "ramp": 1.5 }
}
```

## Effects

Every effect has its own switch in the control panel (press `H`), so you
choose what the GPU spends its time on.

| Switch              | What it does                                         | Default |
| ------------------- | ---------------------------------------------------- | ------- |
| Caustics            | Moving web of light on sand, rocks, plants and fish  | on      |
| Shadows             | Sun shadows of fish, rocks and plants                | on      |
| Water reflections   | Image-based light from the water around the tank     | on      |
| Refractive bubbles  | Glass-like bubbles instead of sprites                | on      |
| Light shaft planes  | Cheap shafts; redundant with volumetric light        | off     |
| Coral fluorescence  | Corals and anemones glow under blue and violet LEDs  | on      |
| Ambient occlusion   | Darkens creases and contact areas                    | off     |
| Volumetric light    | Shafts through the water, occluded by fish and kelp  | on      |
| Depth of field      | Blurs what is nearer or further than the focus plane | off     |
| Bloom               | Soft glow around the brightest pixels                | on      |
| SMAA anti-aliasing  | Smooths thin edges (grass, fins) that MSAA misses    | off     |
| Vignette and dither | Darker corners; dither against banding on LED walls  | on      |

Ambient occlusion is by far the most expensive (about 18 ms per frame at
1080p on a mid-range GPU) and depth of field looks like blur on a wall seen
with the naked eye, so both start off. Watch the fps counter while you
switch: on the wall, keep the set that stays at 60 fps.

Each effect's parameters and ranges are documented, with their tuned
defaults, in `src/render/effects/`. To add a new effect: create a file there
with `defineEffect` (id, panel name, stage, default on/off, Zod parameter
schema with defaults, `create` returning a Three.js pass), and add it to
`EFFECTS` in `src/render/effects/index.ts`. It appears in the panel; nothing
else in the engine changes.

## Materials

Surface textures are KTX2 files: they stay compressed on the GPU, about a
quarter of the memory of PNG or WebP, which matters at 4K. They are built
from CC0 sources by a script:

```bash
python scripts/build_materials.py            # all materials
python scripts/build_materials.py reef-rock  # just one
```

It needs Python 3 with Pillow and NumPy, and KTX-Software's `ktx` tool. Either
install KTX-Software, or extract its release into the ignored `tools/ktx/`
folder, for example on Windows:

```bash
7z x KTX-Software-4.4.2-Windows-x64.exe -otools/ktx
```

To add a material, add its source to `MATERIALS` in the script, run it, list
the source in `ASSETS.md` and use its id in a scene.

## Development

```bash
pnpm test           # unit tests (Vitest)
pnpm test:coverage  # with coverage thresholds
pnpm test:e2e       # browser tests (Playwright, software WebGL)
pnpm test:visual    # pixel comparison of a frozen frame (on demand)
pnpm lint
pnpm typecheck
pnpm build
```

The code is layered (`core` → `scene` → `sim` → `render`/`ui` → `app`), and
simulation logic runs without a browser so it can be developed test-first.
Read [AGENTS.md](AGENTS.md) before contributing: it covers architecture, TDD
rules, code quality and performance rules.

## Roadmap

- More scenes: Mediterranean seagrass, jellyfish room, shark tunnel, dolphin pool.
- Layered image backdrops with parallax.
- glTF fish (e.g. the CC0 Quaternius animated fish) and a WebGPU renderer.
- Interaction: phone remote (feeding, tapping the glass), webcam presence,
  head-tracked perspective.

## License

Code: [MIT](LICENSE). Third-party assets, when added, are listed with their
licenses in [ASSETS.md](ASSETS.md).
